import { describe, expect, it } from 'vitest'
import { consumeBenchmarkApply, markBenchmarkApply, peekBenchmarkApply } from './benchmarkIntent'

describe('benchmarkIntent', () => {
  it('peeks the same value until consumed', () => {
    markBenchmarkApply(['1.1.1.1'])
    expect(peekBenchmarkApply()).toEqual(['1.1.1.1'])
    expect(peekBenchmarkApply()).toEqual(['1.1.1.1'])
  })

  it('consume clears the handoff', () => {
    markBenchmarkApply(['1.1.1.1'])
    consumeBenchmarkApply()
    expect(peekBenchmarkApply()).toBeNull()
  })

  it('defaults to null with no handoff', () => {
    consumeBenchmarkApply()
    expect(peekBenchmarkApply()).toBeNull()
  })

  it('latest mark wins', () => {
    markBenchmarkApply(['a'])
    markBenchmarkApply(['b'])
    expect(peekBenchmarkApply()).toEqual(['b'])
    consumeBenchmarkApply()
  })
})
