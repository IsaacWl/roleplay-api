import Database from '@ioc:Adonis/Lucid/Database'
import { test } from '@japa/runner'
import { UserFactory } from 'Database/factories'
import Mail from '@ioc:Adonis/Addons/Mail'
import Hash from '@ioc:Adonis/Core/Hash'
import { DateTime, Duration } from 'luxon'
// import Event from '@ioc:Adonis/Core/Event'
// import Mail from '@ioc:Adonis/Addons/Mail'

test.group('Password', (group) => {
  group.each.setup(async () => {
    await Database.beginGlobalTransaction()
    return () => Database.rollbackGlobalTransaction()
  })

  test('it should send an email with forgot password instructions', async ({ client, assert }) => {
    const user = await UserFactory.create()
    const mailer = Mail.fake()

    // Event.on('mail:sent', ({ message }) => {
    //   assert.deepEqual(message.to, [
    //     {
    //       address: user.email,
    //       name: '',
    //     },
    //   ])
    //   assert.deepEqual(message.from, {
    //     address: 'no-reply@roleplay.com',
    //     name: '',
    //   })
    //   assert.equal(message.subject, 'Roleplay: Password Recovery')
    //   assert.include(message.html!, user.username)
    // })

    const response = await client.post('/forgot-password').json({
      email: user.email,
      resetPasswordUrl: 'http://reset-password',
    })
    response.assertStatus(204)

    assert.isTrue(mailer.exists({ to: [{ address: user.email }] }))
    assert.isTrue(mailer.exists({ from: { address: 'no-reply@roleplay.com' } }))
    assert.isTrue(mailer.exists({ subject: 'Roleplay: Password Recovery' }))
    assert.isTrue(mailer.exists((mail) => mail.html!.includes(user.username)))

    Mail.restore()
  })

  test('it should create a reset password token', async ({ assert, client }) => {
    const user = await UserFactory.create()

    Mail.fake()

    const response = await client.post('/forgot-password').json({
      email: user.email,
      resetPasswordUrl: 'url',
    })

    response.assertStatus(204)
    const tokens = await user.related('tokens').query()

    assert.isNotEmpty(tokens)
  })

  test('it should return 422 when required data is not provided or is invalid', async ({
    assert,
    client,
  }) => {
    Mail.fake()
    const response = await client.post('/forgot-password').json({})

    response.assertStatus(422)
    const body = response.body()

    assert.equal(body.code, 'BAD_REQUEST')
    assert.equal(body.status, 422)
  })

  test('it should be able to reset password', async ({ assert, client }) => {
    const user = await UserFactory.create()
    const { token } = await user.related('tokens').create({ token: 'token' })

    const response = await client.post('/reset-password').json({ token, password: '123456' })
    response.assertStatus(204)

    await user.refresh()

    assert.isTrue(await Hash.verify(user.password, '123456'))
  })

  test('it should return 422 when data is not provided or is invalid', async ({
    assert,
    client,
  }) => {
    const response = await client.post('/reset-password').json({})

    response.assertStatus(422)
    const body = response.body()

    assert.equal(body.code, 'BAD_REQUEST')
    assert.equal(body.status, 422)
  })

  test('it should return 404 when using the same token twice', async ({ assert, client }) => {
    const user = await UserFactory.create()
    const { token } = await user.related('tokens').create({ token: 'token' })
    await client.post('/reset-password').json({
      token,
      password: '123456',
    })

    const response = await client.post('/reset-password').json({
      token,
      password: '123456',
    })

    response.assertStatus(404)

    const body = response.body()

    assert.equal(body.code, 'BAD_REQUEST')
    assert.equal(body.status, 404)
  })

  test('it should not reset password if token is expired after 2 hours', async ({
    assert,
    client,
  }) => {
    const user = await UserFactory.create()
    const date = DateTime.now().minus(Duration.fromISOTime('02:01'))
    const { token } = await user.related('tokens').create({ token: 'token', createdAt: date })

    const response = await client.post('/reset-password').json({
      token,
      password: '123456',
    })

    response.assertStatus(410)
    const body = response.body()

    assert.equal(body.code, 'TOKEN_EXPIRED')
    assert.equal(body.status, 410)
    assert.equal(body.message, 'token has expired')
  })
})
