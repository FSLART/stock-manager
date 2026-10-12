import { describe, expect, it } from 'vitest'
import { router } from './index'

describe('application routes', () => {
  it('exposes the public application routes', () => {
    expect(
      router
        .getRoutes()
        .map((route) => route.path)
        .sort()
    ).toEqual(['/', '/board-signals', '/movements', '/pcbs', '/settings', '/stock'])
  })
})
