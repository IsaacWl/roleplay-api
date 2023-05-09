import { test } from '@japa/runner'
import { UserFactory } from 'Database/factories'
import Hash from '@ioc:Adonis/Core/Hash'
import Database from '@ioc:Adonis/Lucid/Database'
import User from 'App/Models/User'

// const BASE_URL = `http://${process.env.HOST}:${process.env.PORT}`
// test('display welcome page', async ({ client }) => {
//   const response = await client.get('/')

//   response.assertStatus(200)
//   response.assertBodyContains({ hello: 'world' })
// })
// users: {
//   id: number,
//   email: string,
//   username: string,
//   password: string,
//   avatar: string
// }
let token = ''
let user = {} as User

test.group('User', (group) => {
  group.each.setup(async ({ context }) => {
    const plainPassword = 'password'
    const newUser = await UserFactory.merge({
      password: plainPassword,
    }).create()
    const response = await context.client.post('/sessions').json({
      email: newUser.email,
      password: plainPassword,
    })
    token = response.body().token.token
    user = newUser

    return async () => {
      await context.client.delete('/sessions').header('Authorization', `Bearer ${token}`)
    }
  })
  group.each.setup(async () => {
    await Database.beginGlobalTransaction()
    return () => Database.rollbackGlobalTransaction()
  })
  test('it should create an user', async ({ client, assert }) => {
    const userPayload = {
      email: 'harry@email.com',
      username: 'harry',
      password: 'password',
      avatar: 'https://image.com/image/1',
    }
    const response = await client.post('/users').json(userPayload)
    response.assertStatus(201)
    const { user } = response.body()

    assert.exists(user, 'User undefined')
    assert.exists(user.id, 'Id undefined')
    assert.equal(user.email, userPayload.email)
    assert.equal(user.username, userPayload.username)
    assert.notExists(user.password, 'Password defined')
  })

  test('it should return 409 when email is already in user', async ({ client, assert }) => {
    const { email } = await UserFactory.create()
    const response = await client.post('/users').json({
      email,
      username: 'harry',
      password: 'password',
      avatar: 'https://images.com/image/1',
    })
    response.assertStatus(409)
    const value = response.body()

    assert.exists(value.message)
    assert.exists(value.code)
    assert.exists(value.status)
    assert.include(value.message, 'email')
    assert.equal(value.code, 'BAD_REQUEST')
    assert.equal(value.status, 409)
  })

  test('it should return 409 when username registered', async ({ client, assert }) => {
    const { username } = await UserFactory.create()

    const response = await client.post('/users').json({
      username,
      email: 'harry@email.com',
      password: 'password',
      avatar: '',
    })
    response.assertStatus(409)
    const value = response.body()

    assert.exists(value.message)
    assert.exists(value.code)
    assert.exists(value.status)
    assert.include(value.message, 'username')
    assert.equal(value.code, 'BAD_REQUEST')
    assert.equal(value.status, 409)
  })

  test('it should return 422 when required data is not provided', async ({ client, assert }) => {
    const response = await client.post('/users').json({})
    const values = response.body()

    response.assertStatus(422)

    assert.equal(values.code, 'BAD_REQUEST')
    assert.equal(values.status, 422)
  })

  test('it should return 422 when not valid email', async ({ client }) => {
    const response = await client.post('/users').json({
      email: 'notvalid@c.',
      username: 'username',
      password: 'password',
      avatar: '',
    })
    response.assertStatus(422)
  })

  test('it should return 422 when not valid password', async ({ client }) => {
    const response = await client.post('/users').json({
      email: 'email@email.com',
      username: 'username',
      password: '111',
      avatar: '',
    })

    response.assertStatus(422)
  })

  test('it should update an user', async ({ client, assert }) => {
    // const { id, password } = await UserFactory.create()
    const email = 'email@email.com'
    const avatar = 'https://images.com/image/2'

    const response = await client
      .put(`/users/${user.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        email,
        avatar,
        password: user.password,
      })
    const values = response.body()
    response.assertStatus(200)
    assert.exists(values.user, 'User undefined')
    assert.equal(values.user.email, email)
    assert.equal(values.user.avatar, avatar)
    assert.equal(values.user.id, user.id)
  })

  test('it should update the password of the user', async ({ client, assert }) => {
    // const user = await UserFactory.create()
    const password = 'password'

    const response = await client
      .put(`/users/${user.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        email: user.email,
        avatar: user.avatar,
        password,
      })

    const values = response.body()
    response.assertStatus(200)
    assert.exists(values.user, 'User undefined')
    assert.equal(values.user.id, user.id)

    await user['refresh']()
    assert.isTrue(await Hash.verify(user['password'], password))
  })

  test('it should return 422 when required data not provided', async ({ client, assert }) => {
    const { id } = await UserFactory.create()
    const response = await client
      .put(`/users/${id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const values = response.body()
    response.assertStatus(422)
    assert.equal(values.code, 'BAD_REQUEST')
    assert.equal(values.status, 422)
  })

  test('it should return 422 when email not valid', async ({ client, assert }) => {
    const { id, password, avatar } = await UserFactory.create()
    const response = await client
      .put(`/users/${id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        email: 'email@c.',
        password,
        avatar,
      })
    const values = response.body()
    response.assertStatus(422)

    assert.equal(values.code, 'BAD_REQUEST')
    assert.equal(values.status, 422)
  })

  test('it should return 422 when password not valid', async ({ client, assert }) => {
    const { id, avatar, email } = await UserFactory.create()

    const response = await client
      .put(`/users/${id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        avatar,
        email,
        password: 'pas',
      })
    const values = response.body()
    response.assertStatus(422)

    assert.equal(values.code, 'BAD_REQUEST')
    assert.equal(values.status, 422)
  })

  test('it should return 422 when avatar not valid', async ({ client, assert }) => {
    const { id, email, password } = await UserFactory.create()

    const response = await client
      .put(`/users/${id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        email,
        password,
        avatar: 'http://images.c',
      })
    const values = response.body()
    response.assertStatus(422)
    assert.equal(values.code, 'BAD_REQUEST')
    assert.equal(values.status, 422)
  })
})
