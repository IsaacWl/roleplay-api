import Database from '@ioc:Adonis/Lucid/Database'
import { test } from '@japa/runner'
import { UserFactory } from 'Database/factories'

test.group('Session', (group) => {
  group.each.setup(async () => {
    await Database.beginGlobalTransaction()
    return () => Database.rollbackGlobalTransaction()
  })

  test('it should authenticate an user', async ({ assert, client }) => {
    const plainPassword = 'password'
    const { id, email } = await UserFactory.merge({ password: plainPassword }).create()
    const response = await client.post('/sessions').json({ email, password: plainPassword })
    response.assertStatus(201)
    const user = response.body().user

    assert.isDefined(user, 'User undefined')
    assert.equal(user.id, id)
  })

  test('it should return an api token when session is created', async ({ assert, client }) => {
    const plainPassword = 'password'
    const { id, email } = await UserFactory.merge({ password: plainPassword }).create()
    const response = await client.post('/sessions').json({ email, password: plainPassword })
    response.assertStatus(201)

    const body = response.body()

    assert.isDefined(body.token, 'Token undefined')
    assert.equal(body.user.id, id)
  })

  test('it should return 400 when credentials are not provided', async ({ assert, client }) => {
    const response = await client.post('/sessions').json({})
    const error = response.body()
    response.assertStatus(400)

    assert.equal(error.code, 'BAD_REQUEST')
    assert.equal(error.status, 400)
    assert.equal(error.message, 'invalid credentials')
  })

  test('it should return 400 when credentials are invalid', async ({ assert, client }) => {
    const { email } = await UserFactory.create()
    const response = await client.post('/sessions').json({
      email,
      password: 'pass',
    })
    response.assertStatus(400)
    const error = response.body()

    assert.equal(error.code, 'BAD_REQUEST')
    assert.equal(error.status, 400)
    assert.equal(error.message, 'invalid credentials')
  })

  test('it should return 200 when user signs out', async ({ client }) => {
    const plainPassword = 'password'
    const { email } = await UserFactory.merge({ password: plainPassword }).create()

    const response = await client.post('/sessions').json({
      email,
      password: plainPassword,
    })
    response.assertStatus(201)

    const apiToken = response.body().token

    const logout = await client
      .delete('/sessions')
      .header('Authorization', `Bearer ${apiToken.token}`)
    logout.assertStatus(200)
  })

  test('it should revoke token when user signs out', async ({ assert, client }) => {
    const plainPassword = 'password'
    const { email } = await UserFactory.merge({ password: plainPassword }).create()

    const response = await client.post('/sessions').json({
      email,
      password: plainPassword,
    })

    response.assertStatus(201)

    const apiToken = response.body().token

    const tokenExpected = await Database.query().select('*').from('api_tokens')
    assert.notEmpty(tokenExpected)

    await client.delete('/sessions').header('Authorization', `Bearer ${apiToken.token}`)

    const tokenUnexpected = await Database.query().select('*').from('api_tokens')
    assert.isEmpty(tokenUnexpected)
  })
})
