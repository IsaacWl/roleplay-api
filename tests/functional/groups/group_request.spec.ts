import Database from '@ioc:Adonis/Lucid/Database'
import { test } from '@japa/runner'
import GroupRequest from 'App/Models/GroupRequest'
import User from 'App/Models/User'
import { GroupFactory, UserFactory } from 'Database/factories'

let token = ''
let user = {} as User

test.group('Group Request', (group) => {
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

  test('it should create a group request', async ({ assert, client }) => {
    const { id: userId } = await UserFactory.create()
    const group = await GroupFactory.merge({ master: userId }).create()

    const response = await client
      .post(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    response.assertStatus(201)
    const groupRequest = response.body().groupRequest
    assert.exists(groupRequest, 'GroupRequest undefined')
    assert.equal(groupRequest.userId, user.id)
    assert.equal(groupRequest.groupId, group.id)
    assert.equal(groupRequest.status, 'PENDING')
  })

  test('it should return 409 when group request already exists', async ({ assert, client }) => {
    const { id } = await UserFactory.create()
    const group = await GroupFactory.merge({ master: id }).create()
    await client
      .post(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const response = await client
      .post(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    response.assertStatus(409)
    const error = response.body()

    assert.equal(error.code, 'BAD_REQUEST')
    assert.equal(error.status, 409)
  })

  test('it should return 422 when user is already in the group', async ({ assert, client }) => {
    const groupPayload = {
      name: 'group',
      description: 'lorem ipsum',
      schedule: 'schedule',
      location: 'location',
      chronic: 'chronic',
      master: user.id,
    }

    const groupResponse = await client
      .post('/groups')
      .header('Authorization', `Bearer ${token}`)
      .json(groupPayload)

    const group = groupResponse.body().group

    const response = await client
      .post(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    response.assertStatus(422)

    const error = response.body()

    assert.equal(error.code, 'BAD_REQUEST')
    assert.equal(error.status, 422)
  })

  test('it should list group requests by master', async ({ assert, client }) => {
    const master = await UserFactory.create()
    const group = await GroupFactory.merge({ master: master.id }).create()

    const postResponse = await client
      .post(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const groupRequest = postResponse.body().groupRequest

    const getResponse = await client
      .get(`/groups/${group.id}/requests?master=${master.id}`)
      .header('Authorization', `Bearer ${token}`)

    getResponse.assertStatus(200)

    const groupRequests = getResponse.body().groupRequests

    assert.exists(groupRequests, 'GroupRequest undefined')
    assert.equal(groupRequests.length, 1)
    assert.equal(groupRequests[0].id, groupRequest.id)
    assert.equal(groupRequests[0].userId, groupRequest.userId)
    assert.equal(groupRequests[0].groupId, groupRequest.groupId)
    assert.equal(groupRequests[0].status, groupRequest.status)
    assert.equal(groupRequests[0].group.name, group.name)
    // assert.equal(groupRequests[0].group.description, group.description)
    // assert.equal(groupRequests[0].group.schedule, group.schedule)
    // assert.equal(groupRequests[0].group.location, group.location)
    // assert.equal(groupRequests[0].group.chronic, group.chronic)
    assert.equal(groupRequests[0].user.username, user.username)
    assert.equal(groupRequests[0].group.master, master.id)
  })

  test('it should return an empty list when master has no group requests', async ({
    assert,
    client,
  }) => {
    const master = await UserFactory.create()
    const group = await GroupFactory.merge({ master: master.id }).create()

    await client
      .post(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const response = await client
      .get(`/groups/${group.id}/requests?master=${user.id}`)
      .header('Authorization', `Bearer ${token}`)

    const groupRequests = response.body().groupRequests
    assert.exists(groupRequests, 'GroupRequests undefined')
    assert.equal(groupRequests.length, 0)
  })

  test('it should return 422 when master is not provided', async ({ assert, client }) => {
    const master = await UserFactory.create()
    const group = await GroupFactory.merge({ master: master.id }).create()

    const response = await client
      .get(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(422)

    const error = response.body()

    assert.equal(error.code, 'BAD_REQUEST')
    assert.equal(error.status, 422)
  })

  test('it should accept a group request', async ({ assert, client }) => {
    // const master = await UserFactory.create()
    const group = await GroupFactory.merge({ master: user.id }).create()

    const createResponse = await client
      .post(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const firstGroupRequest = createResponse.body().groupRequest

    const acceptResponse = await client
      .post(`/groups/${group.id}/requests/${firstGroupRequest.id}/accept`)
      .header('Authorization', `Bearer ${token}`)

    acceptResponse.assertStatus(200)
    const secondGroupRequest = acceptResponse.body().groupRequest

    assert.exists(secondGroupRequest, 'GroupRequest undefined')
    assert.equal(secondGroupRequest.userId, user.id)
    assert.equal(secondGroupRequest.groupId, group.id)
    assert.equal(secondGroupRequest.status, 'ACCEPTED')

    await group.load('players')
    assert.isNotEmpty(group.players)
    assert.equal(group.players.length, 1)
    assert.equal(group.players[0].id, user.id)
  })

  test('it should return 404 when providing an unexisting group', async ({ assert, client }) => {
    const master = await UserFactory.create()
    const group = await GroupFactory.merge({ master: master.id }).create()

    const firstResponse = await client
      .post(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const firstGroupRequest = firstResponse.body().groupRequest
    const secondResponse = await client
      .post(`/groups/2/requests/${firstGroupRequest.id}/accept`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    secondResponse.assertStatus(404)

    const error = secondResponse.body()
    assert.equal(error.code, 'BAD_REQUEST')
    assert.equal(error.status, 404)
  })

  test('it should return 404 when providing an unexisting group request', async ({
    assert,
    client,
  }) => {
    const master = await UserFactory.create()
    const group = await GroupFactory.merge({ master: master.id }).create()

    // await client
    //   .post(`/groups/${group.id}/requests`)
    //   .header('Authorization', `Bearer ${token}`)
    //   .json({})

    const response = await client
      .post(`/groups/${group.id}/requests/1/accept`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    response.assertStatus(404)

    const error = response.body()
    assert.equal(error.code, 'BAD_REQUEST')
    assert.equal(error.status, 404)
  })

  test('it should reject a group request', async ({ assert, client }) => {
    // const master = await UserFactory.create()
    const group = await GroupFactory.merge({ master: user.id }).create()

    const firstResponse = await client
      .post(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const firstGroupRequest = firstResponse.body().groupRequest

    const secondResponse = await client
      .delete(`/groups/${group.id}/requests/${firstGroupRequest.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    secondResponse.assertStatus(200)

    const groupRequest = await GroupRequest.find(firstGroupRequest.id)
    assert.isNull(groupRequest)
  })

  test('it should return 404 when providing an unexisting group for rejection', async ({
    assert,
    client,
  }) => {
    const master = await UserFactory.create()
    const group = await GroupFactory.merge({ master: master.id }).create()

    const firstResponse = await client
      .post(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const firstGroupRequest = firstResponse.body().groupRequest

    const secondResponse = await client
      .delete(`/groups/8/requests/${firstGroupRequest.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    secondResponse.assertStatus(404)

    const error = secondResponse.body()

    assert.equal(error.code, 'BAD_REQUEST')
    assert.equal(error.status, 404)
  })

  test('it should return 404 when providing an unexisting group request for rejection', async ({
    assert,
    client,
  }) => {
    const master = await UserFactory.create()
    const group = await GroupFactory.merge({ master: master.id }).create()

    await client
      .post(`/groups/${group.id}/requests`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    const response = await client
      .delete(`/groups/${group.id}/requests/8`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    response.assertStatus(404)
    const error = response.body()

    assert.equal(error.code, 'BAD_REQUEST')
    assert.equal(error.status, 404)
  })
})
