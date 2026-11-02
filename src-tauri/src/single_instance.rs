use tracing::{info, warn};
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Threading::{CreateMutexW, OpenMutexW, MUTEX_ALL_ACCESS};
use windows::core::PCWSTR;

/// Name of the global mutex used for single-instance enforcement.
const MUTEX_NAME: &str = "Global\\GravityApp";

/// Guard that keeps the mutex alive. Drop it when the app exits.
pub struct SingleInstanceGuard {
    _handle: windows::Win32::Foundation::HANDLE,
}

impl Drop for SingleInstanceGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self._handle);
        }
    }
}

/// Attempt to acquire the single-instance mutex.
///
/// Returns `Ok(guard)` if this is the first instance.
/// Returns `Err(())` if another instance already holds the mutex.
pub fn acquire() -> Result<SingleInstanceGuard, ()> {
    let wide_name: Vec<u16> = MUTEX_NAME.encode_utf16().chain(std::iter::once(0)).collect();

    // First, check if the mutex already exists
    let existing = unsafe { OpenMutexW(MUTEX_ALL_ACCESS, false, PCWSTR(wide_name.as_ptr())) };
    if let Ok(handle) = existing {
        // Another instance holds it — close our handle and signal duplicate
        unsafe {
            let _ = CloseHandle(handle);
        }
        warn!("Another instance of Gravity is already running");
        return Err(());
    }

    // Create the mutex (we're the first instance)
    let handle = unsafe { CreateMutexW(None, true, PCWSTR(wide_name.as_ptr())) };
    match handle {
        Ok(h) => {
            info!("Single-instance mutex acquired");
            Ok(SingleInstanceGuard { _handle: h })
        }
        Err(e) => {
            warn!("Failed to create single-instance mutex: {e}");
            Err(())
        }
    }
}
