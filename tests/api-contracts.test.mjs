import test from 'node:test'
import assert from 'node:assert/strict'
import { harness, plain } from './adapter-harness.mjs'

test('cart fulfilment maps direct and wrapped backend responses, dates and capacity', async () => {
  const raw = { pickupEnabled: true, deliveryEnabled: true, deliveryFee: '7.50', slots: [
    { id: 'slot', localDate: '2030-01-02', startTime: '10:00', endTime: '11:00', capacity: 5, reservedCount: 2 },
    { id: 'full', localDate: '2030-01-02', startTime: '11:00', endTime: '12:00', capacity: 1, reservedCount: 1 },
  ] }
  for (const body of [raw, { data: raw }, { fulfilment: raw }, { data: { fulfilment: raw } }]) {
    const h = harness()
    h.reply(body)
    const options = await h.load('src/services/cartApi.ts').cartApi.getFulfilmentOptions('shop')
    assert.equal(options.pickupEnabled, true)
    assert.equal(options.deliveryEnabled, true)
    assert.equal(options.deliveryFee, 7.5)
    assert.equal(options.slots.length, 1)
    assert.equal(options.slots[0].date, '2030-01-02')
    assert.equal(options.slots[0].remainingCapacity, 3)
  }
})

test('cart reads, adds, updates and removes using backend snapshots without catalogue', async () => {
  const h = harness()
  const api = h.load('src/services/cartApi.ts').cartApi
  const snapshot = { shopId: 'shop', items: [{ productId: 'product', productName: 'Rice', unitPrice: '12.50', quantity: 2 }], subtotal: '25.00' }
  h.reply(snapshot)
  const cart = await api.load([], [])
  assert.equal(cart.lines[0].product.name, 'Rice')
  assert.equal(cart.subtotal, 25)
  h.reply(snapshot)
  await api.addItem({ id: 'product', shopId: 'shop' }, [], [])
  assert.equal(h.calls[1].method, 'POST')
  assert.deepEqual(JSON.parse(h.calls[1].body), { shopId: 'shop', productId: 'product', quantity: 1 })
  h.reply(snapshot)
  await api.updateQuantity('product', 2, [], [])
  assert.equal(h.calls[2].method, 'PATCH')
  h.reply({ items: [], empty: true, subtotal: 0 })
  assert.equal((await api.removeItem('product', [], [])).lines.length, 0)
  assert.equal(h.calls[3].method, 'DELETE')
})

test('cart exposes server errors instead of pretending a failed route is empty', async () => {
  const h = harness()
  h.reply({ message: 'Route unavailable' }, 404)
  await assert.rejects(h.load('src/services/cartApi.ts').cartApi.load([], []), /Route unavailable/)
})

test('checkout preview sends delivery selection and preserves server price and state', async () => {
  const h = harness()
  h.reply({ cartId: 'cart', shopId: 'shop', subtotal: 25, deliveryFee: 7.5, total: 32.5, fulfilmentMethod: 'DELIVERY', slotId: 'slot', paymentAvailable: true, checkoutStatus: 'PAYMENT_PENDING' })
  const preview = await h.load('src/services/cartApi.ts').cartApi.previewCheckout({ fulfilmentMethod: 'DELIVERY', deliverySlotId: 'slot' })
  assert.deepEqual(JSON.parse(h.calls[0].body), { fulfilmentMethod: 'DELIVERY', deliverySlotId: 'slot' })
  assert.equal(preview.total, 32.5)
  assert.equal(preview.slotId, 'slot')
  assert.equal(preview.paymentAvailable, true)
})

test('seller uses PATCH fulfilment and localDate/reservedCount slot contract', async () => {
  const h = harness({ role: 'seller' })
  const api = h.load('src/services/sellerApi.ts').sellerApi
  const settings = { deliveryEnabled: true, pickupEnabled: false, deliveryFee: 15, minimumOrder: 50, businessTimezone: 'Asia/Kolkata' }
  h.reply({ shopId: 'shop', ...settings })
  const result = await api.saveFulfilment('shop', settings)
  assert.equal(h.calls[0].method, 'PATCH')
  assert.equal(result.minimumOrder, 50)
  assert.equal(result.deliveryEnabled, true)
  const slot = { id: 'slot', shopId: 'shop', localDate: '2030-01-02', startTime: '10:00', endTime: '11:00', capacity: 5, reservedCount: 2, active: true }
  h.reply(slot)
  const created = await api.createDeliverySlot('shop', { date: slot.localDate, startTime: slot.startTime, endTime: slot.endTime, capacity: 5 })
  assert.equal(JSON.parse(h.calls[1].body).localDate, slot.localDate)
  assert.equal(JSON.parse(h.calls[1].body).date, undefined)
  assert.equal(created.date, slot.localDate)
  assert.equal(created.booked, 2)
  h.reply({ verificationStatus: 'VERIFIED', businessName: 'Test' })
  assert.equal((await api.getProfile()).status, 'APPROVED')
})

test('order mapper preserves payment state, shop name and timeline', () => {
  const h = harness()
  const order = h.load('src/services/sellerApi.ts').mapOrder({ id: 'order', shopId: 'shop', shopName: 'Local shop', paymentMethod: 'ONLINE', paymentStatus: 'PAID', updatedAt: '2030-01-01', statusHistory: [{ fromStatus: null, toStatus: 'PENDING', changedAt: '2030-01-01' }] })
  assert.equal(order.shopName, 'Local shop')
  assert.equal(order.paymentStatus, 'PAID')
  assert.equal(order.statusHistory[0].toStatus, 'PENDING')
  assert.equal(order.updatedAt, '2030-01-01')
})

test('refund requires a caller key and reuses it after an ambiguous failure', async () => {
  const h = harness()
  const api = h.load('src/services/refundApi.ts').refundApi
  const input = { orderId: 'order', amount: 12.5, reason: 'Damaged item', idempotencyKey: 'stable-test-key' }
  await assert.rejects(api.create({ ...input, idempotencyKey: '' }), /stable submission key/)
  assert.equal(h.calls.length, 0)
  h.fail('Network interrupted')
  await assert.rejects(api.create(input), /Network interrupted/)
  h.reply({ id: 'refund', orderId: 'order', requesterId: 'buyer', amount: 12.5, status: 'REQUESTED' })
  const result = await api.create(input)
  assert.equal(result.buyerId, 'buyer')
  assert.equal(h.calls[0].headers.get('Idempotency-Key'), input.idempotencyKey)
  assert.equal(h.calls[1].headers.get('Idempotency-Key'), input.idempotencyKey)
})

test('refund queue includes approved requests and completion is explicitly dev-only', async () => {
  const h = harness({ role: 'support' })
  const api = h.load('src/services/refundApi.ts').refundApi
  h.reply([]); h.reply([]); h.reply([{ id: 'refund', status: 'APPROVED' }])
  assert.equal((await api.listQueue())[0].status, 'APPROVED')
  assert.ok(h.calls.some((call) => call.url.endsWith('status=APPROVED')))
  await assert.rejects(api.decide('refund', 'APPROVE', ''), /decision note/)
  h.reply({ id: 'refund', status: 'COMPLETED' })
  assert.equal((await api.completeSandbox('refund')).status, 'COMPLETED')
  assert.ok(h.calls.at(-1).url.endsWith('/sandbox-complete'))
  h.config.environment = 'prod'
  await assert.rejects(api.completeSandbox('refund'), /only in development/)
})

test('notifications preserve readAt and only offer role-safe in-app destinations', async () => {
  const h = harness()
  h.reply([
    { id: 'n1', body: 'Order changed', relatedEntityType: 'ORDER', relatedEntityId: 'order', readAt: null },
    { id: 'n2', body: 'Case changed', relatedEntityType: 'SUPPORT_CASE', relatedEntityId: 'case', readAt: '2030-01-01' },
    { id: 'n3', href: 'https://untrusted.example', relatedEntityType: 'UNKNOWN', readAt: null },
  ])
  const list = await h.load('src/services/notificationsApi.ts').notificationsApi.list()
  assert.equal(list[0].read, false)
  assert.equal(list[0].relatedEntityId, 'order')
  assert.equal(list[0].href, '#orders')
  assert.equal(list[1].read, true)
  assert.equal(list[1].href, '#support')
  assert.equal(list[2].href, undefined)
})

test('support accepts general and shop cases and filters the operator queue', async () => {
  const h = harness()
  const { customerSupportApi, supportApi } = h.load('src/services/supportApi.ts')
  h.reply({ id: 'case', reasonCode: 'OTHER', status: 'OPEN' })
  await customerSupportApi.createCase({ reason: 'OTHER', description: 'General question' })
  assert.deepEqual(JSON.parse(h.calls[0].body), { reasonCode: 'OTHER', description: 'General question' })
  h.reply({ id: 'case2', shopId: 'shop', status: 'OPEN' })
  assert.equal((await customerSupportApi.createCase({ shopId: 'shop', reason: 'OTHER', description: 'Shop question' })).shopId, 'shop')
  h.identity.role = 'support'
  h.reply([{ id: 'case', status: 'RESOLVED' }])
  assert.equal((await supportApi.listQueue('RESOLVED'))[0].status, 'RESOLVED')
  assert.ok(h.calls.at(-1).url.endsWith('/api/support/queue?status=RESOLVED'))
  h.reply([{ id: 'case', status: 'RESOLVED' }])
  await supportApi.getCase('case')
  assert.ok(h.calls.at(-1).url.endsWith('/api/support/queue'))
})

test('catalogue maps stock and does not invent opening hours or ratings', async () => {
  const h = harness()
  h.reply([{ id: 'shop', name: 'Shop', city: 'Gurugram', products: [{ id: 'p1', name: 'Rice', price: 20, availableQuantity: 0 }, { id: 'p2', name: 'Milk', price: 30, availableQuantity: 4 }] }])
  const catalog = await h.load('src/services/catalogApi.ts').catalogApi.load()
  assert.equal(catalog.products[0].available, false)
  assert.equal(catalog.products[1].available, true)
  assert.equal(catalog.shops[0].open, undefined)
  assert.equal(catalog.shops[0].rating, undefined)
})

test('auth recovery and verification use the actual backend routes', async () => {
  const h = harness({ realAuth: true })
  const api = h.load('src/services/authApi.ts').authApi
  h.reply({ message: 'Requested' })
  await api.requestPasswordReset(' buyer@example.test ')
  assert.ok(h.calls[0].url.endsWith('/api/auth/request-password-reset'))
  assert.deepEqual(JSON.parse(h.calls[0].body), { email: 'buyer@example.test' })
  h.reply({ message: 'Reset' })
  await api.resetPassword({ token: 'test-only-token', newPassword: 'test-only-password' })
  assert.ok(h.calls[1].url.endsWith('/api/auth/reset-password'))
  h.reply({ id: 'buyer', role: 'BUYER' })
  await api.devLogin('buyer')
  h.reply({ message: 'Requested' })
  await api.requestEmailVerification()
  assert.ok(h.calls[3].url.endsWith('/api/auth/request-email-verification'))
  assert.equal(h.calls[3].headers.get('X-User-Id'), 'buyer')
  assert.equal(h.calls[3].body, undefined)
})

test('non-dev auth never exposes development tokens or seeded headers', async () => {
  const h = harness({ realAuth: true, environment: 'prod' })
  const api = h.load('src/services/authApi.ts').authApi
  h.reply({ message: 'Requested', developmentToken: 'test-only-token' })
  assert.deepEqual(plain(await api.requestPasswordReset('buyer@example.test')), { message: 'Requested' })
  assert.equal(api.headers().get('X-User-Id'), null)
  await assert.rejects(api.devLogin('buyer'), /only available in the dev environment/)
})
