import { expect, test } from '@playwright/test'

test('configured Live and Replay show the same real Board journal', async ({ page, request }) => {
  const target = process.env.CHESSBOARD_LIVE_TEST_URL
  test.skip(!target, 'Set CHESSBOARD_LIVE_TEST_URL to a running connected Chessboard server')
  test.setTimeout(45_000)
  const browserRoot = target!
  await expect.poll(async () => {
    const response = await request.get(new URL('/api/events', browserRoot).href)
    const data = await response.json()
    return data.status === 'live' && data.events.length > 0 && data.events.every((event: { source: string }) => event.source === 'board')
  }, { timeout: 35_000 }).toBe(true)
  await page.goto(browserRoot)
  await page.getByRole('button', { name: 'Live', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Connected')
  await expect(page.getByRole('heading', { name: 'Vercel Board' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Activity', exact: true }).locator('li').first()).toBeVisible()
  await expect(page.getByText('Release the workspace search')).toHaveCount(0)
  await page.getByRole('button', { name: 'Pause visualization' }).click()
  await expect(page.getByText('Visualization paused', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Replay', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Recorded data')
  await expect(page.getByRole('slider', { name: 'Timeline position' })).not.toHaveAttribute('max', '0')
  await page.getByRole('slider', { name: 'Timeline position' }).focus()
  await page.keyboard.press('End')
  await expect(page.getByRole('region', { name: 'Activity', exact: true }).locator('li').first()).toBeVisible()
})
