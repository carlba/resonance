import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';

describe('AppModule (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET / returns the greeting', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it('GET on an unknown route answers 404 through the exception filter', async () => {
    const response = await request(app.getHttpServer()).get('/does-not-exist').expect(404);

    expect(response.body).toMatchObject({ statusCode: 404 });
  });

  describe('POST /demo/echo', () => {
    it('returns a valid body', () => {
      return request(app.getHttpServer())
        .post('/demo/echo')
        .send({ message: 'hi' })
        .expect(201)
        .expect({ message: 'hi' });
    });

    it('rejects a wrong type', async () => {
      const response = await request(app.getHttpServer())
        .post('/demo/echo')
        .send({ message: 42 })
        .expect(400);

      expect(response.body.message).toEqual(expect.arrayContaining(['message must be a string']));
    });

    it('rejects a missing field', async () => {
      const response = await request(app.getHttpServer()).post('/demo/echo').send({}).expect(400);

      expect(response.body.message).toEqual(expect.arrayContaining(['message must be a string']));
    });

    it('rejects an unknown property', async () => {
      const response = await request(app.getHttpServer())
        .post('/demo/echo')
        .send({ message: 'hi', role: 'admin' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['property role should not exist'])
      );
    });
  });
});
