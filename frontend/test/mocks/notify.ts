import { vi } from "vitest"

export function createNotifyMock() {
  return {
    notify: vi.fn(),
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    notifyInfo: vi.fn(),
    notifyProgress: vi.fn(),
    notifyDismiss: vi.fn(),
  }
}
