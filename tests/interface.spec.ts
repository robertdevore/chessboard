import { expect, test } from '@playwright/test'

test('desktop inspector, keyboard selection, semantic motion and deterministic scrubbing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1150 })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Simulated data')
  const board = page.getByLabel('Chessboard positions')
  await expect(board.locator('[data-piece]')).toHaveCount(8)
  const reviewer = page.getByRole('button', { name: /Audit, Bishop, Verifying/ })
  await reviewer.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible()
  await expect(page.getByText('Verify search against release criteria').first()).toBeVisible()
  await page.keyboard.press('ArrowUp')
  await expect(board.locator('[data-piece]:focus')).not.toHaveAttribute('data-piece', 'demo:audit')
  const initial = await reviewer.evaluate(element => getComputedStyle(element).transform)
  const position = page.getByRole('slider', { name: 'Timeline position' })
  await position.focus()
  const frames = page.evaluate(() => new Promise<{ frames: number; moves: number }>(resolve => {
    const piece = document.querySelector('[data-piece="demo:audit"]')!
    const positions = new Set<string>()
    let frames = 0
    const start = performance.now()
    const sample = () => {
      positions.add(getComputedStyle(piece).transform)
      frames++
      if (performance.now() - start < 850) requestAnimationFrame(sample)
      else resolve({ frames, moves: positions.size })
    }
    requestAnimationFrame(sample)
  }))
  await page.keyboard.press('End')
  const sample = await frames
  expect(sample.frames).toBeGreaterThan(8)
  expect(sample.moves).toBeGreaterThan(4)
  const delivered = page.getByRole('button', { name: /Audit, Bishop, Delivered/ })
  await expect(delivered).toBeVisible()
  await expect.poll(() => delivered.evaluate(element => getComputedStyle(element).transform)).not.toBe(initial)
  await page.getByText('Artifacts and verification').click()
  await expect(page.getByText(/Passed · keyboard, indexing/)).toBeVisible()
  await page.getByRole('button', { name: 'Restart timeline' }).click()
  await expect(board.locator('[data-piece]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Live', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Not configured')
  await expect(board.locator('[data-piece]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Replay', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Recorded data')
  await expect(board.locator('[data-piece]')).toHaveCount(0)
})

test('mobile keeps board squares and controls inside the viewport with reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const board = page.getByLabel('Chessboard positions')
  const boxes = await board.locator('[data-piece]').evaluateAll(items => items.map(item => {
    const { x, y, width, height } = item.getBoundingClientRect()
    return [x, y, width, height]
  }))
  expect(boxes).toHaveLength(8)
  const outer = (await board.boundingBox())!
  for (const [x, y, width, height] of boxes) {
    expect(x).toBeGreaterThanOrEqual(outer.x)
    expect(y).toBeGreaterThanOrEqual(outer.y)
    expect(x + width).toBeLessThanOrEqual(outer.x + outer.width + 0.1)
    expect(y + height).toBeLessThanOrEqual(outer.y + outer.height + 0.1)
  }
  await page.getByRole('button', { name: /Forge, Rook/ }).click()
  await expect(page.getByRole('heading', { name: 'Forge' })).toBeInViewport()
  await page.getByRole('textbox', { name: 'Search agents and tasks' }).fill('indexing')
  await page.getByRole('region', { name: 'Tasks', exact: true }).getByRole('button', { name: /Build the indexing API/ }).click()
  await expect(page.getByRole('heading', { name: 'Build the indexing API' })).toBeVisible()
})

test('save verified desktop and mobile screenshots', async ({ page }) => {
  test.skip(process.env.CHESSBOARD_CAPTURE !== '1', 'Set CHESSBOARD_CAPTURE=1 to refresh documentation screenshots')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 1150 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Audit, Bishop, Verifying/ })).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true })
})
