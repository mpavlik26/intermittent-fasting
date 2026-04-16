const { test, expect } = require('@playwright/test');
test('minimal', async () => {
  expect(1+1).toBe(2);
});
