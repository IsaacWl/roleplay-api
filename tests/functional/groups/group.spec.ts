import Database from '@ioc:Adonis/Lucid/Database'
import { test } from '@japa/runner'
import Group from 'App/Models/Group'
import User from 'App/Models/User'
import { GroupFactory, UserFactory } from 'Database/factories'

let token = ''
let user = {} as User

test.group('Group', (group) => {
  group.each.setup(async ({ context }) => {
    const plainPassword = 'password'
    const newUser = await UserFactory.merge({ password: plainPassword }).create()
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

  test('it should create a group', async ({ assert, client }) => {
    const user = await UserFactory.create()
    const groupPayload = {
      name: 'test',
      description: 'test',
      schedule: 'test',
      location: 'test',
      chronic: 'test',
      master: user.id,
    }
    const response = await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json(groupPayload)
    response.assertStatus(201)
    const group = response.body().group

    assert.equal(group.name, groupPayload.name)
    assert.equal(group.description, groupPayload.description)
    assert.equal(group.schedule, groupPayload.schedule)
    assert.equal(group.location, groupPayload.location)
    assert.equal(group.chronic, groupPayload.chronic)
    assert.equal(group.master, groupPayload.master)
    assert.exists(group.players, 'Players undefined')
    assert.equal(group.players.length, 1)
    assert.equal(group.players[0].id, groupPayload.master)
  })

  test('it should return 422 when required data is not provided', async ({ assert, client }) => {
    const response = await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json({})
    response.assertStatus(422)

    const error = response.body()

    assert.equal(error.code, 'BAD_REQUEST')
    assert.equal(error.status, 422)
  })

  test('it should update a group', async ({ assert, client }) => {
    // const master = await UserFactory.create()
    const group = await GroupFactory.merge({ master: user.id }).create()

    const payload = {
      name: 'test',
      description: 'test',
      schedule: 'test',
      location: 'test',
      chronic: 'test',
    }

    const response = await client
      .patch(`/groups/${group.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json(payload)

    response.assertStatus(200)
    const groupResponse = response.body().group

    assert.exists(groupResponse, 'Group undefined')
    assert.equal(groupResponse.name, payload.name)
    assert.equal(groupResponse.description, payload.description)
    assert.equal(groupResponse.schedule, payload.schedule)
    assert.equal(groupResponse.location, payload.location)
    assert.equal(groupResponse.chronic, payload.chronic)
  })

  test('it should return 404 when providing an unexisting group to update', async ({
    assert,
    client,
  }) => {
    const response = await client
      .patch(`/groups/10`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    response.assertStatus(404)

    const error = response.body()

    assert.equal(error.code, 'BAD_REQUEST')
    assert.equal(error.status, 404)
  })

  test('it should remove user from group', async ({ assert, client }) => {
    const group = await GroupFactory.merge({ master: user.id }).create()
    const newUser = await UserFactory.merge({ password: 'password' }).create()

    const sessionResponse = await client
      .post('/sessions')
      .json({ email: newUser.email, password: 'password' })

    const playerToken = sessionResponse.body().token.token

    const groupResponse = await client
      .post(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${playerToken}`)
      .json({})

    const groupRequest = groupResponse.body().groupRequest

    await client
      .post(`/groups/${group.id}/requests/${groupRequest.id}/accept`)
      .header('Authorization', `Bearer ${token}`)

    const response = await client
      .delete(`/groups/${group.id}/players/${newUser.id}`)
      .header('Authorization', `Bearer ${token}`)
    response.assertStatus(200)

    await group.load('players')
    assert.isEmpty(group.players)
  })

  test('it should not remove the master of the group', async ({ assert, client }) => {
    const groupPayload = {
      name: 'test',
      description: 'test',
      schedule: 'test',
      location: 'test',
      chronic: 'test',
      master: user.id,
    }

    const createdResponse = await client
      .post(`/groups`)
      .header('Authorization', `Bearer ${token}`)
      .json(groupPayload)

    const group = createdResponse.body().group

    const response = await client
      .delete(`/groups/${group.id}/players/${user.id}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(400)

    const groupModel = await Group.findOrFail(group.id)

    await groupModel.load('players')
    assert.isNotEmpty(groupModel.players)
  })

  test('it should remove the group', async ({ assert, client }) => {
    const groupPayload = {
      name: 'test',
      description: 'test',
      schedule: 'test',
      location: 'test',
      chronic: 'test',
      master: user.id,
    }

    const createdResponse = await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json(groupPayload)

    const group = createdResponse.body().group

    const deleteResponse = await client
      .delete(`/groups/${group.id}`)
      .header('Authorization', `Bearer ${token}`)

    deleteResponse.assertStatus(200)

    const emptyGroup = await Database.query().from('groups').where('id', group.id)

    const players = await Database.query().from('groups_users')

    assert.isEmpty(emptyGroup)
    assert.isEmpty(players)
  })

  test('it should return 404 when providing an unexisting group for deletion', async ({
    assert,
    client,
  }) => {
    const response = await client
      .delete('/groups/1')
      .header('Authorization', `Bearer ${token}`)
      .json({})
    response.assertStatus(404)

    const error = response.body()

    assert.equal(error.code, 'BAD_REQUEST')
    assert.equal(error.status, 404)
  })

  test('it should return all groups when no query is provided to list groups', async ({
    assert,
    client,
  }) => {
    const groupPayload = {
      name: 'test',
      description: 'test',
      schedule: 'test',
      location: 'test',
      chronic: 'test',
      master: user.id,
    }

    const postResponse = await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json(groupPayload)
    const group = postResponse.body().group

    const getResponse = await client
      .get('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const groups = getResponse.body().groups
    assert.exists(groups, 'Groups undefined')
    assert.equal(groups.length, 1)
    assert.equal(groups[0].id, group.id)
    assert.equal(groups[0].name, group.name)
    assert.equal(groups[0].description, group.description)
    assert.equal(groups[0].location, group.location)
    assert.equal(groups[0].schedule, group.schedule)
    assert.exists(groups[0].masterUser, 'Master undefined')
    assert.equal(groups[0].masterUser.id, user.id)
    assert.equal(groups[0].masterUser.username, user.username)
    assert.isNotEmpty(groups[0].players, 'Empty players')
    assert.equal(groups[0].players[0].id, user.id)
    assert.equal(groups[0].players[0].username, user.username)
    assert.equal(groups[0].players[0].email, user.email)
  })

  test('it should return no groups by user id', async ({ assert, client }) => {
    const groupPayload = {
      name: 'test',
      description: 'test',
      schedule: 'test',
      location: 'test',
      chronic: 'test',
      master: user.id,
    }

    await client.post('/groups').header('Authorization', `Bearer ${token}`).json(groupPayload)

    const getResponse = await client
      .get('/groups?user=123')
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const groups = getResponse.body().groups

    assert.exists(groups, 'Groups undefined')
    assert.equal(groups.length, 0)
  })

  test('it should return all groups by user id', async ({ assert, client }) => {
    const groupPayload = {
      name: 'test',
      description: 'test',
      schedule: 'test',
      location: 'test',
      chronic: 'test',
      master: user.id,
    }

    const postResponse = await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json(groupPayload)
    const group = postResponse.body().group

    const getResponse = await client
      .get(`/groups?user=${user.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const groups = getResponse.body().groups.data
    assert.exists(groups, 'Groups undefined')
    assert.equal(groups.length, 1)
    assert.equal(groups[0].id, group.id)
    assert.equal(groups[0].name, group.name)
    assert.equal(groups[0].description, group.description)
    assert.equal(groups[0].location, group.location)
    assert.equal(groups[0].schedule, group.schedule)
    assert.exists(groups[0].masterUser, 'Master undefined')
    assert.equal(groups[0].masterUser.id, user.id)
    assert.equal(groups[0].masterUser.username, user.username)
    assert.isNotEmpty(groups[0].players, 'Empty players')
    assert.equal(groups[0].players[0].id, user.id)
    assert.equal(groups[0].players[0].username, user.username)
    assert.equal(groups[0].players[0].email, user.email)
  }).pin()

  test('it should return all groups by user id and name', async ({ assert, client }) => {
    const groupPayload = {
      name: 'test',
      description: 'test',
      schedule: 'test',
      location: 'test',
      chronic: 'test',
      master: user.id,
    }

    await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json({ ...groupPayload, name: 'hello', description: 'hello' })

    const postResponse = await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json(groupPayload)

    const group = postResponse.body().group

    const getResponse = await client
      .get(`/groups?user=${user.id}&text=es`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const groups = getResponse.body().groups.data

    assert.exists(groups, 'Groups undefined')
    assert.equal(groups.length, 1)
    assert.equal(groups[0].id, group.id)
    assert.equal(groups[0].name, group.name)
    assert.equal(groups[0].description, group.description)
    assert.equal(groups[0].location, group.location)
    assert.equal(groups[0].schedule, group.schedule)
    assert.exists(groups[0].masterUser, 'Master undefined')
    assert.equal(groups[0].masterUser.id, user.id)
    assert.equal(groups[0].masterUser.username, user.username)
    assert.isNotEmpty(groups[0].players, 'Empty players')
    assert.equal(groups[0].players[0].id, user.id)
    assert.equal(groups[0].players[0].username, user.username)
    assert.equal(groups[0].players[0].email, user.email)
  }).pin()

  test('it should return all groups by user id and description', async ({ assert, client }) => {
    const groupPayload = {
      name: 'hello',
      description: 'test',
      schedule: 'test',
      location: 'test',
      chronic: 'test',
      master: user.id,
    }

    await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json({ ...groupPayload, description: 'hello' })

    const postResponse = await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json(groupPayload)
    const group = postResponse.body().group

    const getResponse = await client
      .get(`/groups?user=${user.id}&text=es`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const groups = getResponse.body().groups.data
    assert.exists(groups, 'Groups undefined')
    assert.equal(groups.length, 1)
    assert.equal(groups[0].id, group.id)
    assert.equal(groups[0].name, group.name)
    assert.equal(groups[0].description, group.description)
    assert.equal(groups[0].location, group.location)
    assert.equal(groups[0].schedule, group.schedule)
    assert.exists(groups[0].masterUser, 'Master undefined')
    assert.equal(groups[0].masterUser.id, user.id)
    assert.equal(groups[0].masterUser.username, user.username)
    assert.isNotEmpty(groups[0].players, 'Empty players')
    assert.equal(groups[0].players[0].id, user.id)
    assert.equal(groups[0].players[0].username, user.username)
    assert.equal(groups[0].players[0].email, user.email)
  }).pin()

  test('it should return all groups by name', async ({ assert, client }) => {
    const groupPayload = {
      name: 'test',
      description: 'hello',
      schedule: 'test',
      location: 'test',
      chronic: 'test',
      master: user.id,
    }

    const postResponse = await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json(groupPayload)

    const group = postResponse.body().group

    await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json({ ...groupPayload, name: 'hello', description: 'hello' })

    const getResponse = await client
      .get(`/groups?text=es`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const groups = getResponse.body().groups.data
    assert.exists(groups, 'Groups undefined')
    assert.equal(groups.length, 1)
    assert.equal(groups[0].id, group.id)
    assert.equal(groups[0].name, group.name)
    assert.equal(groups[0].description, group.description)
    assert.equal(groups[0].location, group.location)
    assert.equal(groups[0].schedule, group.schedule)
    assert.exists(groups[0].masterUser, 'Master undefined')
    assert.equal(groups[0].masterUser.id, user.id)
    assert.equal(groups[0].masterUser.username, user.username)
    assert.isNotEmpty(groups[0].players, 'Empty players')
    assert.equal(groups[0].players[0].id, user.id)
    assert.equal(groups[0].players[0].username, user.username)
    assert.equal(groups[0].players[0].email, user.email)
  }).pin()

  test('it should return all groups by description', async ({ assert, client }) => {
    const groupPayload = {
      name: 'hello',
      description: 'test',
      schedule: 'test',
      location: 'test',
      chronic: 'test',
      master: user.id,
    }

    const postResponse = await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json(groupPayload)
    const group = postResponse.body().group

    await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json({ ...groupPayload, name: 'hello', description: 'hello' })

    const getResponse = await client
      .get(`/groups?text=es`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const groups = getResponse.body().groups.data
    assert.exists(groups, 'Groups undefined')
    assert.equal(groups.length, 1)
    assert.equal(groups[0].id, group.id)
    assert.equal(groups[0].name, group.name)
    assert.equal(groups[0].description, group.description)
    assert.equal(groups[0].location, group.location)
    assert.equal(groups[0].schedule, group.schedule)
    assert.exists(groups[0].masterUser, 'Master undefined')
    assert.equal(groups[0].masterUser.id, user.id)
    assert.equal(groups[0].masterUser.username, user.username)
    assert.isNotEmpty(groups[0].players, 'Empty players')
    assert.equal(groups[0].players[0].id, user.id)
    assert.equal(groups[0].players[0].username, user.username)
    assert.equal(groups[0].players[0].email, user.email)
  }).pin()
})
