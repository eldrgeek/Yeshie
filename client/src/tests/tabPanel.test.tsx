import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock Stepper to avoid real execution
const stepperMock = vi.fn(async () => 'ok')
vi.mock('../../../extension/functions/Stepper', () => ({ Stepper: stepperMock }))

// Simple in-memory storage mock
let storageData: Record<string, any> = {}
const storageGet = vi.fn(async (key: string) => ({ [key]: storageData[key] }))
const storageSet = vi.fn(async (items: Record<string, any>) => { Object.assign(storageData, items) })
const storageGetAll = vi.fn(async () => ({ ...storageData }))
vi.mock('../../../extension/functions/storage', () => ({
  storageGet,
  storageSet,
  storageGetAll
}))

// Mock messaging
const sendToBackground = vi.fn(async () => ({ success: true }))
vi.mock('@plasmohq/messaging', () => ({ sendToBackground }))

// Mock react-toastify
const toastSuccess = vi.fn()
const toastError = vi.fn()
const toastInfo = vi.fn()
const toastWarn = vi.fn()
vi.mock('react-toastify', () => ({
  ToastContainer: (p: any) => <div>{p.children}</div>,
  toast: {
    success: toastSuccess,
    error: toastError,
    info: toastInfo,
    warn: toastWarn
  },
  Slide: {}
}))

// Provide sample instructions
vi.mock('../../../extension/ipc/instructions.json', () => ({
  default: {
    tasks: [
      {
        taskName: 'Demo',
        steps: [
          { id: 'one', cmd: 'click' },
          { id: 'two', cmd: 'click' }
        ]
      }
    ]
  }
}))

// Mock chrome.runtime and chrome.storage used directly
const sendMessage = vi.fn(async () => ({}))
const chromeGet = vi.fn(async (key: string) => ({ [key]: storageData[key] }))

beforeEach(() => {
  vi.resetModules()
  document.body.innerHTML = '<div id="root"></div>'
  storageData = {}
  sendMessage.mockClear()
  stepperMock.mockClear()
  toastSuccess.mockClear()
  toastError.mockClear()
  toastInfo.mockClear()
  toastWarn.mockClear()

  // @ts-ignore
  global.chrome = {
    runtime: {
      sendMessage,
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() }
    },
    storage: {
      local: {
        get: chromeGet,
        set: storageSet
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
    },
    tabs: { update: vi.fn() }
  }
})

afterEach(() => {
  // cleanup DOM
  document.body.innerHTML = ''
})

describe('Tab panel script runner', () => {
  it('runs instructions when Auto-run is toggled', async () => {
    const mod = await import('../../../extension/tabs/index')
    const checkbox = screen.getAllByLabelText(/Auto-run Script/i)[0] as HTMLInputElement
    fireEvent.click(checkbox)

    await waitFor(() => expect(stepperMock).toHaveBeenCalledTimes(2))
    expect(sendMessage).toHaveBeenCalledWith({ type: 'WRITE_RESULTS_JSON', log: expect.any(Array) })
    const logArg = sendMessage.mock.calls[0][0].log
    expect(logArg.length).toBe(2)
    expect(toastSuccess).toHaveBeenCalledWith('Test complete: results.json written.', { autoClose: 3000 })
  })

  it('shows error toast on step failure', async () => {
    stepperMock.mockRejectedValueOnce(new Error('boom'))
    const mod = await import('../../../extension/tabs/index')
    const checkbox = screen.getAllByLabelText(/Auto-run Script/i)[0] as HTMLInputElement
    fireEvent.click(checkbox)

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastError.mock.calls[0][1]).toEqual({ autoClose: 10000 })
  })

  it('archives results and displays them', async () => {
    const mod = await import('../../../extension/tabs/index')
    // run once to generate archive name
    const checkbox = screen.getAllByLabelText(/Auto-run Script/i)[0] as HTMLInputElement
    fireEvent.click(checkbox)
    await waitFor(() => expect(stepperMock).toHaveBeenCalled())

    const archiveBtn = screen.getByRole('button', { name: /archive test/i })
    fireEvent.click(archiveBtn)
    expect(storageSet).toHaveBeenCalled()

    // Provide archived data on fetch
    storageGetAll.mockResolvedValueOnce({ 'archived_test_Demo': { foo: 'bar' } })
    const viewBtn = screen.getByRole('button', { name: /view tests/i })
    fireEvent.click(viewBtn)
    await screen.findByText(/Archived Test Viewer/i)
    await screen.findByText('Demo')
  })

  it('downloads results', async () => {
    const mod = await import('../../../extension/tabs/index')
    storageData['ipc_results'] = { ok: true }
    const resultsBtn = screen.getAllByRole('button', { name: /results/i })[0]
    const createSpy = vi.spyOn(document, 'createElement')
    fireEvent.click(resultsBtn)
    expect(chromeGet).toHaveBeenCalledWith('ipc_results')
    expect(createSpy).toHaveBeenCalledWith('a')
  })
})
