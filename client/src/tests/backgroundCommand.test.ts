import { describe, it, expect, vi } from 'vitest'
import { executeCommand } from '../../../extension/background/messages/command'

vi.mock('../../../extension/functions/Stepper', () => ({
  Stepper: vi.fn(async () => 'ok')
}))

describe('background command handler', () => {
  it('returns success result from Stepper', async () => {
    const res = await executeCommand('click #id')
    expect(res.success).toBe(true)
    expect(res.result).toBe('ok')
  })

  it('returns error when Stepper throws', async () => {
    const mod = await import('../../../extension/functions/Stepper')
    const StepperMock = mod.Stepper as unknown as vi.Mock
    StepperMock.mockRejectedValueOnce(new Error('fail'))
    const res = await executeCommand('bad')
    expect(res.success).toBe(false)
    expect(res.error).toBe('fail')
  })
})
