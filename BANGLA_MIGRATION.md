# Maaniko বাংলা data migration

এই পরিবর্তনে database schema-এর bilingual columnগুলো এখনই drop করা হয়নি। `*Bn`
column একমাত্র content source এবং পুরোনো required `*En` column compatibility fallback
হিসেবে একই বাংলা value রাখে। এতে production data নষ্ট না করে ধাপে ধাপে বাংলা-only
system চালু করা যায়।

## Production-এ চালানোর নিরাপদ ক্রম

1. Neon console থেকে production branch-এর backup/restore point তৈরি করুন।
2. Backend-এর নতুন code deploy করার আগে environment-এ সঠিক `DATABASE_URL` নিশ্চিত করুন।
3. নিচের commandগুলো project root থেকে চালান:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run data:migrate:bangla:check
npm run data:migrate:bangla
npm run data:migrate:bangla:check
```

শেষ command-এ পরিবর্তনযোগ্য row না থাকলে migration সম্পন্ন। Scriptটি idempotent—প্রয়োজনে
একাধিকবার চালালেও একই ফল থাকবে।

## Seed কখন চালাবেন

নতুন/খালি database-এর জন্য:

```bash
npm run prisma:seed
```

চলমান production database-এ শুধু ভাষা বদলাতে `prisma:seed` চালাবেন না। Seed পরিচিত
catalog recordগুলোর nested image, bullet, review ও FAQ নতুন করে তৈরি করে; production-এর
admin-edited content overwrite হতে পারে। Existing production data-এর জন্য শুধু
`data:migrate:bangla` ব্যবহার করুন।

## Rollback

Migration-এর আগে নেওয়া Neon restore point থেকে database restore করুন এবং আগের backend,
admin ও frontend release deploy করুন। Migration script বাংলা value `*En` fallback-এ copy
করে; `*Bn` source column পরিবর্তন করে না।
