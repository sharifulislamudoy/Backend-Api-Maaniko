# Maaniko Backend API

NestJS + Prisma/PostgreSQL backend for the Maaniko storefront and admin portal.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, and `SUPER_ADMIN_EMAIL`.
3. Install and initialize:

```bash
npm ci
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed
npm run start:dev
```

The server defaults to `http://localhost:5000`.

## Catalog API

Public reads:

- `GET /products`, `GET /products/:slug`
- `GET /combos`, `GET /combos/:slug`
- `GET /banners?placement=HOME_HERO|SHOP_HERO`
- `GET /journeys`

Authenticated ADMIN/SUPER_ADMIN writes:

- `GET /products/admin/all`, `POST /products`, `PATCH /products/:id`, `DELETE /products/:id`
- `GET /combos/admin/all`, `POST /combos`, `PATCH /combos/:id`, `DELETE /combos/:id`
- `GET /banners/admin/all`, `POST /banners`, `PATCH /banners/:id`, `DELETE /banners/:id`

## Seed

`prisma/catalog.seed.json` contains the migrated legacy catalog: 24 products, 6 combos, 4 banners, and 7 journeys. The seed is idempotent for these records.

```bash
npm run prisma:seed
```

Products use normalized category, journey, image, detail, attribute/value, and variant relations. Combos reference real products through `ComboProduct`; product records are not duplicated.

