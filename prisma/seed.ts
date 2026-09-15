import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BannerPlacement,
  CatalogStatus,
  ComboListKind,
  ContentPageCategory,
  PrismaClient,
  ProductBulletKind,
  Role,
  Status,
} from '@prisma/client';

const prisma = new PrismaClient();
const catalog = JSON.parse(
  readFileSync(join(__dirname, 'catalog.seed.json'), 'utf8'),
) as { products: any[]; combos: any[]; journeys: any[]; banners: any[] };

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'uncategorized';

const contentPageSeed = [
  {
    slug: 'help-center',
    category: ContentPageCategory.SUPPORT,
    title: 'হেল্প সেন্টার',
    eyebrow: 'সহায়তা',
    summary:
      'Maaniko থেকে অর্ডার, পেমেন্ট, ডেলিভারি এবং পণ্য ব্যবহার সম্পর্কে প্রয়োজনীয় সহায়তা এখানে পাবেন।',
    sortOrder: 10,
    sections: [
      {
        title: 'কীভাবে সাহায্য পাবেন',
        body: 'আপনার প্রশ্নটি আগে নিচের সাধারণ বিষয়গুলোর সঙ্গে মিলিয়ে দেখুন। আরও সহায়তা প্রয়োজন হলে Contact Us পেজ থেকে আমাদের সাপোর্ট টিমের সঙ্গে যোগাযোগ করুন।',
      },
      {
        title: 'অর্ডার সংক্রান্ত সহায়তা',
        body: 'অর্ডার নম্বর, ব্যবহৃত মোবাইল নম্বর এবং সমস্যার সংক্ষিপ্ত বিবরণ প্রস্তুত রাখুন। এতে আমাদের টিম দ্রুত অর্ডার খুঁজে প্রয়োজনীয় সহায়তা দিতে পারবে।',
      },
      {
        title: 'পণ্য সম্পর্কে প্রশ্ন',
        body: 'পণ্যের ব্যবহার, উপাদান বা উপযোগিতা জানতে সংশ্লিষ্ট product details দেখুন। স্বাস্থ্যসংক্রান্ত সিদ্ধান্তের ক্ষেত্রে নিবন্ধিত চিকিৎসক বা বিশেষজ্ঞের পরামর্শ নিন।',
      },
    ],
  },
  {
    slug: 'how-to-order',
    category: ContentPageCategory.SUPPORT,
    title: 'কীভাবে অর্ডার করবেন',
    eyebrow: 'অর্ডার গাইড',
    summary:
      'পণ্য নির্বাচন থেকে অর্ডার নিশ্চিত করা পর্যন্ত পুরো প্রক্রিয়াটি কয়েকটি সহজ ধাপে সম্পন্ন করুন।',
    sortOrder: 20,
    sections: [
      {
        title: '১. পণ্য নির্বাচন করুন',
        body: 'Shop বা Solution Box থেকে পছন্দের পণ্য নির্বাচন করুন। Custom Solution Box বানাতে Customise বাটনে গিয়ে প্রয়োজনীয় পণ্য যোগ করুন।',
      },
      {
        title: '২. কার্ট যাচাই করুন',
        body: 'পণ্যের নাম, পরিমাণ, মূল্য, ছাড় এবং ডেলিভারি তথ্য ভালোভাবে যাচাই করে Checkout-এ যান।',
      },
      {
        title: '৩. তথ্য দিয়ে অর্ডার নিশ্চিত করুন',
        body: 'সঠিক নাম, মোবাইল নম্বর ও পূর্ণ ঠিকানা লিখুন। পেমেন্ট পদ্ধতি নির্বাচন করে অর্ডার নিশ্চিত করুন। সফল হলে একটি order confirmation দেখতে পাবেন।',
      },
    ],
  },
  {
    slug: 'contact-us',
    category: ContentPageCategory.SUPPORT,
    title: 'যোগাযোগ করুন',
    eyebrow: 'আমরা পাশে আছি',
    summary:
      'অর্ডার, ডেলিভারি বা পণ্য নিয়ে যেকোনো প্রশ্নে Maaniko সাপোর্ট টিমের সঙ্গে যোগাযোগ করুন।',
    sortOrder: 30,
    sections: [
      {
        title: 'কাস্টমার সাপোর্ট',
        body: 'ওয়েবসাইটের যোগাযোগ মাধ্যম ব্যবহার করে আপনার নাম, মোবাইল নম্বর, অর্ডার নম্বর (যদি থাকে) এবং প্রশ্নটি পাঠান। কার্যদিবসে আমাদের টিম যত দ্রুত সম্ভব উত্তর দেবে।',
      },
      {
        title: 'অর্ডার সমস্যা জানাতে',
        body: 'ভুল, ক্ষতিগ্রস্ত বা অসম্পূর্ণ পণ্য পেলে প্যাকেট, ইনভয়েস এবং পণ্যের পরিষ্কার ছবি সংরক্ষণ করুন এবং দ্রুত আমাদের জানান।',
      },
    ],
  },
  {
    slug: 'shipping-policy',
    category: ContentPageCategory.POLICY,
    title: 'শিপিং পলিসি',
    eyebrow: 'ডেলিভারি তথ্য',
    summary:
      'অর্ডার প্রসেসিং, সম্ভাব্য ডেলিভারি সময় এবং ডেলিভারি গ্রহণের গুরুত্বপূর্ণ নিয়মগুলো জেনে নিন।',
    sortOrder: 40,
    sections: [
      {
        title: 'অর্ডার প্রসেসিং',
        body: 'অর্ডার নিশ্চিত হওয়ার পর স্টক ও ঠিকানা যাচাই করে প্যাকেজ প্রস্তুত করা হয়। সরকারি ছুটি, বিশেষ campaign বা অতিরিক্ত অর্ডারের সময়ে processing time কিছুটা বাড়তে পারে।',
      },
      {
        title: 'ডেলিভারি সময় ও চার্জ',
        body: 'ডেলিভারির সময় ও চার্জ checkout-এর সময় গন্তব্য এবং প্রযোজ্য delivery method অনুযায়ী দেখানো হবে। প্রাকৃতিক দুর্যোগ, পরিবহন বিঘ্ন বা অনিবার্য কারণে বিলম্ব হতে পারে।',
      },
      {
        title: 'পণ্য গ্রহণ',
        body: 'পণ্য গ্রহণের সময় প্যাকেটের অবস্থা যাচাই করুন। প্যাকেট দৃশ্যত ক্ষতিগ্রস্ত হলে delivery agent-এর সামনে ছবি বা ভিডিও নিন এবং দ্রুত support team-কে জানান।',
      },
    ],
  },
  {
    slug: 'return-refund-policy',
    category: ContentPageCategory.POLICY,
    title: 'রিটার্ন ও রিফান্ড পলিসি',
    eyebrow: 'ক্রয় সুরক্ষা',
    summary:
      'কোন অবস্থায় রিটার্ন বা রিফান্ড চাওয়া যাবে এবং কীভাবে অনুরোধ করবেন তা এখানে দেওয়া আছে।',
    sortOrder: 50,
    sections: [
      {
        title: 'রিটার্নের যোগ্যতা',
        body: 'ভুল, ক্ষতিগ্রস্ত, মেয়াদোত্তীর্ণ বা অর্ডারের তুলনায় অসম্পূর্ণ পণ্য পেলে delivery গ্রহণের পর যত দ্রুত সম্ভব যোগাযোগ করুন। ব্যবহৃত, খোলা বা গ্রাহকের কারণে ক্ষতিগ্রস্ত পণ্য সাধারণত রিটার্নযোগ্য নয়।',
      },
      {
        title: 'অনুরোধ করার নিয়ম',
        body: 'অর্ডার নম্বর, সমস্যার বিবরণ, প্যাকেট ও পণ্যের পরিষ্কার ছবি বা ভিডিও দিন। যাচাইয়ের জন্য মূল প্যাকেজিং এবং invoice সংরক্ষণ করুন।',
      },
      {
        title: 'রিফান্ড',
        body: 'অনুরোধ অনুমোদিত হলে প্রযোজ্য payment method অনুযায়ী refund process করা হবে। ব্যাংক বা payment provider-এর processing time-এর কারণে অর্থ জমা হতে অতিরিক্ত সময় লাগতে পারে।',
      },
    ],
  },
  {
    slug: 'privacy-policy',
    category: ContentPageCategory.POLICY,
    title: 'প্রাইভেসি পলিসি',
    eyebrow: 'তথ্যের গোপনীয়তা',
    summary:
      'Maaniko কী ধরনের তথ্য সংগ্রহ করে, কেন ব্যবহার করে এবং কীভাবে সুরক্ষিত রাখে তার সারসংক্ষেপ।',
    sortOrder: 60,
    sections: [
      {
        title: 'আমরা যে তথ্য সংগ্রহ করি',
        body: 'অর্ডার সম্পন্ন ও সেবা দিতে নাম, মোবাইল নম্বর, ঠিকানা, অর্ডার তথ্য এবং প্রয়োজনীয় technical usage data সংগ্রহ করা হতে পারে।',
      },
      {
        title: 'তথ্যের ব্যবহার',
        body: 'অর্ডার process, delivery, customer support, fraud prevention এবং সেবার মান উন্নত করতে প্রয়োজন অনুযায়ী তথ্য ব্যবহার করা হয়। আইনগত প্রয়োজন ছাড়া তথ্য অননুমোদিত পক্ষের কাছে বিক্রি করা হয় না।',
      },
      {
        title: 'তথ্য সুরক্ষা ও অধিকার',
        body: 'তথ্য সুরক্ষায় যুক্তিসঙ্গত administrative ও technical ব্যবস্থা নেওয়া হয়। নিজের তথ্য সংশোধন বা privacy-সংক্রান্ত প্রশ্নের জন্য Contact Us পেজের মাধ্যমে যোগাযোগ করুন।',
      },
    ],
  },
  {
    slug: 'terms-and-conditions',
    category: ContentPageCategory.POLICY,
    title: 'শর্তাবলি',
    eyebrow: 'ব্যবহারের নিয়ম',
    summary:
      'Maaniko ওয়েবসাইট ব্যবহার ও অর্ডার করার ক্ষেত্রে প্রযোজ্য সাধারণ শর্তগুলো পড়ুন।',
    sortOrder: 70,
    sections: [
      {
        title: 'ওয়েবসাইট ব্যবহার',
        body: 'ওয়েবসাইট ব্যবহার করে আপনি সঠিক তথ্য প্রদান, আইনসম্মত ব্যবহার এবং প্রকাশিত policy মেনে চলতে সম্মত হন। অপব্যবহার বা প্রতারণামূলক কার্যক্রমের ক্ষেত্রে সেবা সীমিত করা হতে পারে।',
      },
      {
        title: 'পণ্য, মূল্য ও প্রাপ্যতা',
        body: 'পণ্যের তথ্য যথাসম্ভব নির্ভুল রাখার চেষ্টা করা হয়। স্টক, মূল্য বা অনিচ্ছাকৃত ভুলের কারণে অর্ডার সংশোধন বা বাতিলের প্রয়োজন হলে গ্রাহককে জানানো হবে।',
      },
      {
        title: 'স্বাস্থ্যসংক্রান্ত তথ্য',
        body: 'ওয়েবসাইটের তথ্য সাধারণ জ্ঞানের জন্য; এটি চিকিৎসকের diagnosis বা advice-এর বিকল্প নয়। জরুরি বা ব্যক্তিগত চিকিৎসা প্রয়োজন হলে যোগ্য স্বাস্থ্যসেবা পেশাজীবীর পরামর্শ নিন।',
      },
    ],
  },
  {
    slug: 'cancellation-policy',
    category: ContentPageCategory.POLICY,
    title: 'ক্যানসেলেশন পলিসি',
    eyebrow: 'অর্ডার পরিবর্তন',
    summary: 'কখন এবং কীভাবে অর্ডার বাতিলের অনুরোধ করা যাবে তা এখানে জানুন।',
    sortOrder: 80,
    sections: [
      {
        title: 'অর্ডার বাতিলের অনুরোধ',
        body: 'অর্ডার processing বা courier-এর কাছে হস্তান্তরের আগে যত দ্রুত সম্ভব support team-কে cancellation request জানান। অর্ডার নম্বর ও ব্যবহৃত মোবাইল নম্বর দিন।',
      },
      {
        title: 'শিপমেন্টের পর',
        body: 'অর্ডার courier-এর কাছে হস্তান্তর হয়ে গেলে সরাসরি cancellation সম্ভব নাও হতে পারে। সে ক্ষেত্রে প্রযোজ্য return ও refund policy অনুসরণ করা হবে।',
      },
      {
        title: 'প্রিপেইড অর্ডার',
        body: 'অনুমোদিত cancellation-এর prepaid অর্থ প্রযোজ্য payment method-এ ফেরত দেওয়া হবে। payment provider-এর processing time প্রযোজ্য হতে পারে।',
      },
    ],
  },
] satisfies Array<{
  slug: string;
  category: ContentPageCategory;
  title: string;
  eyebrow: string;
  summary: string;
  sortOrder: number;
  sections: Array<{ title: string; body: string }>;
}>;

async function seedContentPages() {
  for (const page of contentPageSeed) {
    const { sections, ...pageData } = page;

    await prisma.contentPage.upsert({
      where: { slug: page.slug },
      // Admin panel থেকে আগে edit করা content seed পুনরায় চালালে বদলাবে না।
      update: {},
      create: {
        ...pageData,
        sections: {
          create: sections.map((section, index) => ({
            ...section,
            sortOrder: (index + 1) * 10,
          })),
        },
      },
    });
  }
}

async function seedCommerceSettings() {
  await prisma.commerceSetting.upsert({
    where: { id: 'default' },
    // Admin panel থেকে সেট করা discount পুনরায় seed চালালে reset হবে না।
    update: {},
    create: {
      id: 'default',
      customComboMinSubtotal: 2000,
      customComboDiscountPercent: 10,
    },
  });
}

const guideSeed = {
  categories: [
    { slug: 'pregnancy-care', name: 'গর্ভকালীন যত্ন' },
    { slug: 'delivery-preparation', name: 'প্রসবের প্রস্তুতি' },
    { slug: 'postpartum-care', name: 'প্রসবোত্তর যত্ন' },
    { slug: 'newborn-care', name: 'নবজাতকের যত্ন' },
    { slug: 'baby-nutrition', name: 'শিশুর খাবার ও পুষ্টি' },
  ],
  guides: [
    {
      slug: 'pregnancy-checkup-guide',
      categorySlug: 'pregnancy-care',
      title: 'গর্ভাবস্থায় নিয়মিত চেকআপ কেন জরুরি',
      excerpt:
        'নিয়মিত গর্ভকালীন সেবা মা ও শিশুর সুস্থতা পর্যবেক্ষণ এবং সম্ভাব্য ঝুঁকি দ্রুত শনাক্ত করতে সাহায্য করে।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/pregnancy-document-organizer/01.png',
      content:
        'গর্ভাবস্থা নিশ্চিত হওয়ার পর যত দ্রুত সম্ভব প্রশিক্ষিত স্বাস্থ্যকর্মী বা চিকিৎসকের সঙ্গে যোগাযোগ করুন। প্রতিটি চেকআপে মায়ের স্বাস্থ্য, রক্তচাপ, ওজন, প্রয়োজনীয় পরীক্ষা এবং শিশুর বৃদ্ধি সম্পর্কে মূল্যায়ন করা হতে পারে।\n\nআগের রিপোর্ট, ব্যবহৃত ওষুধের তালিকা, অ্যালার্জির তথ্য এবং আপনার প্রশ্নগুলো লিখে সঙ্গে নিলে পরামর্শ বুঝতে সুবিধা হয়। চেকআপের সময়সূচি ব্যক্তিভেদে আলাদা হতে পারে, তাই চিকিৎসকের দেওয়া সময় অনুসরণ করুন।',
      points: [
        'সব রিপোর্ট ও প্রেসক্রিপশন এক জায়গায় রাখুন',
        'নির্ধারিত চেকআপ বাদ দেবেন না',
        'নিজে থেকে কোনো ওষুধ বা সাপ্লিমেন্ট শুরু করবেন না',
        'অস্বাভাবিক উপসর্গ হলে পরবর্তী তারিখের জন্য অপেক্ষা করবেন না',
      ],
      source: {
        label: 'WHO — Antenatal care recommendations',
        url: 'https://www.who.int/publications/i/item/9789241549912',
      },
    },
    {
      slug: 'healthy-food-during-pregnancy',
      categorySlug: 'pregnancy-care',
      title: 'গর্ভাবস্থায় স্বাস্থ্যকর খাবারের সহজ নিয়ম',
      excerpt:
        'বৈচিত্র্যময় খাবার, নিরাপদ পানি এবং চিকিৎসকের পরামর্শ অনুযায়ী পুষ্টি গ্রহণের একটি সহজ গাইড।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/time-marker-water-bottle/01.png',
      content:
        'গর্ভাবস্থায় প্রতিদিনের খাবারে ভাত বা রুটি, ডাল, ডিম, মাছ বা মাংস, শাকসবজি, ফল এবং দুধ বা বিকল্প পুষ্টিকর খাবার রাখার চেষ্টা করুন। খাবারের পরিমাণের পাশাপাশি বৈচিত্র্য ও পরিচ্ছন্নতা গুরুত্বপূর্ণ।\n\nকাঁচা বা ঠিকমতো রান্না না হওয়া খাবার এড়িয়ে চলুন এবং নিরাপদ পানি পান করুন। আয়রন, ফলিক অ্যাসিড বা অন্য সাপ্লিমেন্ট কেবল চিকিৎসকের পরামর্শ অনুযায়ী নিন। ডায়াবেটিস, উচ্চ রক্তচাপ বা অন্য সমস্যা থাকলে ব্যক্তিগত খাদ্যতালিকা প্রয়োজন হতে পারে।',
      points: [
        'প্রতিদিন কয়েক ধরনের পুষ্টিকর খাবার রাখুন',
        'ফল ও সবজি ভালোভাবে ধুয়ে নিন',
        'কাঁচা বা আধা সেদ্ধ খাবার এড়িয়ে চলুন',
        'সাপ্লিমেন্টের মাত্রা চিকিৎসকের কাছ থেকে জেনে নিন',
      ],
      source: {
        label: 'WHO — Antenatal care recommendations',
        url: 'https://www.who.int/publications/i/item/9789241549912',
      },
    },
    {
      slug: 'pregnancy-warning-signs',
      categorySlug: 'pregnancy-care',
      title: 'গর্ভাবস্থায় যেসব লক্ষণে দ্রুত সাহায্য নিতে হবে',
      excerpt:
        'কিছু উপসর্গকে সাধারণ অস্বস্তি ভেবে অপেক্ষা না করে দ্রুত চিকিৎসা সহায়তা নেওয়া জরুরি।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/baby-fetal-doppler/01.png',
      content:
        'গর্ভাবস্থায় তীব্র রক্তপাত, খিঁচুনি, অজ্ঞান হওয়া, শ্বাসকষ্ট, প্রচণ্ড মাথাব্যথা, চোখে ঝাপসা দেখা, তীব্র পেটব্যথা বা হঠাৎ গুরুতর অসুস্থতা দেখা দিলে দ্রুত জরুরি চিকিৎসা নিন।\n\nশিশুর নড়াচড়া নিয়ে উদ্বেগ, পানি ভেঙে যাওয়ার সন্দেহ বা সময়ের আগে প্রসবের লক্ষণ হলেও প্রশিক্ষিত স্বাস্থ্যকর্মীর সঙ্গে দ্রুত যোগাযোগ করুন। অনলাইনের সাধারণ তথ্য দিয়ে জরুরি অবস্থা নিশ্চিত বা বাতিল করা যায় না।',
      points: [
        'জরুরি যোগাযোগের নম্বর ফোনে সংরক্ষণ করুন',
        'নিকটস্থ হাসপাতালের পথ আগে থেকে জেনে রাখুন',
        'তীব্র উপসর্গে একা যাতায়াত করবেন না',
        'নিজে রোগ নির্ণয়ের চেষ্টা না করে চিকিৎসা নিন',
      ],
      source: {
        label: 'WHO — Antenatal care recommendations',
        url: 'https://www.who.int/publications/i/item/9789241549912',
      },
    },
    {
      slug: 'pregnancy-sleep-and-movement',
      categorySlug: 'pregnancy-care',
      title: 'গর্ভাবস্থায় বিশ্রাম, ঘুম ও নিরাপদ চলাফেরা',
      excerpt:
        'আরামদায়ক ঘুম, দৈনন্দিন হালকা চলাফেরা এবং শরীরের সংকেত বুঝে বিশ্রাম নেওয়ার ব্যবহারিক পরামর্শ।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/soft-sleep-eye-mask/01.png',
      content:
        'নিয়মিত ঘুমের সময় বজায় রাখা, আরামদায়ক ভঙ্গি বেছে নেওয়া এবং দিনের মধ্যে প্রয়োজনমতো বিশ্রাম নেওয়া ক্লান্তি সামলাতে সাহায্য করতে পারে। দীর্ঘসময় একই ভঙ্গিতে থাকা অস্বস্তিকর হলে ধীরে অবস্থান পরিবর্তন করুন।\n\nজটিলতা না থাকলে চিকিৎসকের অনুমতি অনুযায়ী হালকা হাঁটা বা নিরাপদ দৈনন্দিন নড়াচড়া উপকারী হতে পারে। ব্যথা, মাথা ঘোরা, রক্তপাত, শ্বাসকষ্ট বা অস্বাভাবিক অস্বস্তি হলে কাজ বন্ধ করে চিকিৎসকের পরামর্শ নিন।',
      points: [
        'শরীরের আরাম অনুযায়ী ঘুমের ভঙ্গি ঠিক করুন',
        'হঠাৎ উঠে দাঁড়ানোর বদলে ধীরে নড়াচড়া করুন',
        'অতিরিক্ত চাপ বা পড়ে যাওয়ার ঝুঁকির কাজ এড়িয়ে চলুন',
        'বিশেষ জটিলতা থাকলে ব্যায়ামের আগে চিকিৎসকের অনুমতি নিন',
      ],
      source: {
        label: 'WHO — Antenatal care recommendations',
        url: 'https://www.who.int/publications/i/item/9789241549912',
      },
    },
    {
      slug: 'hospital-bag-checklist',
      categorySlug: 'delivery-preparation',
      title: 'হাসপাতাল ব্যাগের সম্পূর্ণ চেকলিস্ট',
      excerpt:
        'মা, নবজাতক এবং প্রয়োজনীয় কাগজপত্র—সবকিছু আগে থেকে গুছিয়ে রাখার সহজ তালিকা।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/pregnancy-document-organizer/01.png',
      content:
        'সম্ভাব্য প্রসবের তারিখের কয়েক সপ্তাহ আগে একটি ছোট হাসপাতাল ব্যাগ প্রস্তুত রাখুন। মায়ের আরামদায়ক পোশাক, ব্যক্তিগত পরিচ্ছন্নতার সামগ্রী, নবজাতকের পোশাক, কাপড় বা ডায়াপার এবং হাসপাতালের নির্দেশিত জিনিস রাখুন।\n\nপরিচয়পত্র, পরীক্ষা-নিরীক্ষার রিপোর্ট, প্রেসক্রিপশন, রক্তের গ্রুপের তথ্য এবং জরুরি যোগাযোগের নম্বর আলাদা ফাইলে রাখুন। হাসপাতালের নিজস্ব তালিকা থাকলে সেটিই অগ্রাধিকার দিন।',
      points: [
        'মায়ের প্রয়োজনীয় পোশাক ও স্যান্ডেল',
        'নবজাতকের পরিষ্কার পোশাক ও মোড়ানোর কাপড়',
        'সব রিপোর্ট, পরিচয়পত্র ও প্রেসক্রিপশন',
        'ফোন চার্জার এবং জরুরি যোগাযোগের তালিকা',
      ],
      source: {
        label: 'WHO — Maternal and newborn postnatal care',
        url: 'https://www.who.int/publications/i/item/9789240045989',
      },
    },
    {
      slug: 'simple-birth-plan',
      categorySlug: 'delivery-preparation',
      title: 'সহজভাবে Birth Plan তৈরি করবেন যেভাবে',
      excerpt:
        'প্রসবের সময় আপনার পছন্দ, যোগাযোগ এবং জরুরি বিকল্পগুলো ছোট একটি পরিকল্পনায় লিখে রাখুন।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/pregnancy-document-organizer/01.png',
      content:
        'Birth plan কোনো নিশ্চয়তা নয়; এটি মা, পরিবার এবং চিকিৎসা দলের মধ্যে আগেভাগে আলোচনা সহজ করে। কোন হাসপাতালে যাবেন, সঙ্গে কে থাকবেন, যাতায়াত কীভাবে হবে এবং জরুরি সিদ্ধান্তে কার সঙ্গে যোগাযোগ করা হবে—এসব লিখে রাখুন।\n\nব্যথা নিয়ন্ত্রণ, শিশুকে জন্মের পর কাছে রাখা এবং feeding support সম্পর্কে আপনার পছন্দ চিকিৎসকের সঙ্গে আলোচনা করতে পারেন। পরিস্থিতি বদলালে নিরাপত্তার জন্য পরিকল্পনাও বদলাতে পারে—এই নমনীয়তা রাখা জরুরি।',
      points: [
        'হাসপাতাল ও বিকল্প হাসপাতাল ঠিক করুন',
        'যাতায়াত ও সঙ্গে থাকা ব্যক্তির পরিকল্পনা করুন',
        'চিকিৎসকের সঙ্গে পছন্দগুলো আগেই আলোচনা করুন',
        'জরুরি প্রয়োজনে পরিকল্পনা বদলানোর প্রস্তুতি রাখুন',
      ],
      source: {
        label: 'WHO — Antenatal care recommendations',
        url: 'https://www.who.int/publications/i/item/9789241549912',
      },
    },
    {
      slug: 'labour-signs-and-next-steps',
      categorySlug: 'delivery-preparation',
      title: 'প্রসবের লক্ষণ বুঝলে কী করবেন',
      excerpt:
        'নিয়মিত ব্যথা, পানি ভাঙা বা অন্য পরিবর্তন দেখা দিলে শান্তভাবে পরবর্তী পদক্ষেপ নেওয়ার গাইড।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/baby-fetal-doppler/01.png',
      content:
        'প্রসবের সম্ভাব্য লক্ষণের মধ্যে নিয়মিত বিরতিতে ব্যথা, পানি ভাঙা বা রক্তমিশ্রিত স্রাব থাকতে পারে। লক্ষণ শুরু হলে সময় লিখে রাখুন এবং আপনার চিকিৎসক বা নির্ধারিত হাসপাতালের নির্দেশনা অনুসরণ করুন।\n\nতীব্র রক্তপাত, খিঁচুনি, শ্বাসকষ্ট, অজ্ঞান হওয়া, অসহনীয় ব্যথা বা মা-শিশুকে নিয়ে গুরুতর উদ্বেগ থাকলে জরুরি সহায়তা নিন। দূরত্ব ও যানবাহনের অবস্থা বিবেচনায় আগেই যাত্রার পরিকল্পনা রাখুন।',
      points: [
        'ব্যথার সময় ও বিরতি নোট করুন',
        'হাসপাতালে ফোন করে নির্দেশনা নিন',
        'রিপোর্ট ও প্রস্তুত ব্যাগ সঙ্গে নিন',
        'জরুরি লক্ষণে অপেক্ষা না করে বের হন',
      ],
      source: {
        label: 'WHO — Antenatal care recommendations',
        url: 'https://www.who.int/publications/i/item/9789241549912',
      },
    },
    {
      slug: 'delivery-support-person-guide',
      categorySlug: 'delivery-preparation',
      title: 'প্রসবের সময় সঙ্গী বা পরিবারের করণীয়',
      excerpt:
        'প্রসবের আগে ও সময়ে মাকে শান্ত, সম্মানজনক এবং ব্যবহারিক সহায়তা দেওয়ার সহজ নির্দেশনা।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/time-marker-water-bottle/01.png',
      content:
        'সঙ্গীর প্রধান কাজ হলো মায়ের কথা শোনা, তার সিদ্ধান্তকে সম্মান করা এবং চিকিৎসা দলের সঙ্গে পরিষ্কার যোগাযোগে সাহায্য করা। প্রয়োজনীয় কাগজপত্র, ব্যাগ, যাতায়াত এবং জরুরি নম্বর প্রস্তুত রাখুন।\n\nমা অনুমতি দিলে শ্বাস ধীরে নিতে মনে করানো, অবস্থান বদলাতে সাহায্য করা এবং শান্ত পরিবেশ রাখা উপকারী হতে পারে। চিকিৎসা বিষয়ে চাপ সৃষ্টি না করে প্রশিক্ষিত স্বাস্থ্যকর্মীর নির্দেশনা অনুসরণ করুন।',
      points: [
        'মায়ের পছন্দ ও গোপনীয়তাকে সম্মান করুন',
        'প্রয়োজনীয় কাগজপত্র ও ফোন প্রস্তুত রাখুন',
        'শান্তভাবে তথ্য শুনে প্রয়োজন হলে লিখে রাখুন',
        'জরুরি সিদ্ধান্তে চিকিৎসা দলের সঙ্গে সহযোগিতা করুন',
      ],
      source: {
        label: 'WHO — Maternal and newborn postnatal care',
        url: 'https://www.who.int/publications/i/item/9789240045989',
      },
    },
    {
      slug: 'first-six-weeks-after-delivery',
      categorySlug: 'postpartum-care',
      title: 'প্রসবের পর প্রথম ছয় সপ্তাহে মায়ের যত্ন',
      excerpt:
        'বিশ্রাম, পরিচ্ছন্নতা, খাবার, follow-up এবং বিপদের লক্ষণ পর্যবেক্ষণের সংক্ষিপ্ত গাইড।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/maternity-support-belt/01.png',
      content:
        'প্রসবের পর শরীরের সুস্থ হতে সময় লাগে। পর্যাপ্ত বিশ্রাম, পুষ্টিকর খাবার, নিরাপদ পানি এবং পরিবারের সহায়তা গুরুত্বপূর্ণ। চিকিৎসকের দেওয়া ওষুধ ও follow-up নির্দেশনা মেনে চলুন।\n\nঅতিরিক্ত রক্তপাত, তীব্র মাথাব্যথা, শ্বাসকষ্ট, বুকব্যথা, খিঁচুনি, জ্বর, ক্ষতস্থানে বাড়তে থাকা ব্যথা বা দুর্গন্ধযুক্ত স্রাব হলে দ্রুত চিকিৎসা নিন। মানসিক অস্থিরতা বা নিজের বা শিশুর ক্ষতির চিন্তাও জরুরি সাহায্যের কারণ।',
      points: [
        'নির্ধারিত postnatal checkup সম্পন্ন করুন',
        'ভারী কাজের আগে চিকিৎসকের অনুমতি নিন',
        'পরিবারের কাছ থেকে বিশ্রাম ও শিশুর যত্নে সহায়তা নিন',
        'বিপদের লক্ষণে দ্রুত হাসপাতালে যোগাযোগ করুন',
      ],
      source: {
        label: 'WHO — Maternal and newborn postnatal care',
        url: 'https://www.who.int/publications/i/item/9789240045989',
      },
    },
    {
      slug: 'postpartum-mental-wellbeing',
      categorySlug: 'postpartum-care',
      title: 'প্রসবের পর মানসিক সুস্থতার যত্ন',
      excerpt:
        'মন খারাপ, উদ্বেগ ও অতিরিক্ত চাপকে গুরুত্ব দিয়ে পরিবার ও পেশাদার সহায়তা নেওয়ার নির্দেশনা।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/soft-sleep-eye-mask/01.png',
      content:
        'প্রসবের পর ঘুমের অভাব, শারীরিক পরিবর্তন এবং নতুন দায়িত্বের কারণে আবেগে পরিবর্তন হতে পারে। নিজের অনুভূতি বিশ্বস্ত মানুষকে বলুন, বিশ্রামের সুযোগ নিন এবং দৈনন্দিন প্রয়োজনীয় কাজে সহায়তা চান।\n\nমন খারাপ বা উদ্বেগ দীর্ঘস্থায়ী হলে, দৈনন্দিন কাজ ব্যাহত হলে, শিশুর সঙ্গে সংযোগে সমস্যা হলে বা ভয়ংকর চিন্তা এলে দ্রুত চিকিৎসক বা মানসিক স্বাস্থ্য পেশাজীবীর সাহায্য নিন। নিজের বা শিশুর ক্ষতির চিন্তা হলে জরুরি সহায়তা প্রয়োজন।',
      points: [
        'অনুভূতি লুকিয়ে না রেখে বিশ্বস্ত কাউকে বলুন',
        'ঘুম ও খাবারের জন্য পরিবারের সহায়তা নিন',
        'লক্ষণ বাড়লে পেশাদার সাহায্য নিন',
        'নিজের বা শিশুর ক্ষতির চিন্তায় জরুরি সেবা নিন',
      ],
      source: {
        label: 'WHO — Maternal and newborn postnatal care',
        url: 'https://www.who.int/publications/i/item/9789240045989',
      },
    },
    {
      slug: 'breastfeeding-first-days',
      categorySlug: 'postpartum-care',
      title: 'বুকের দুধ খাওয়ানোর প্রথম কয়েক দিন',
      excerpt:
        'শিশুর চাহিদা বুঝে feeding, সঠিক attachment এবং প্রয়োজন হলে দ্রুত সহায়তা নেওয়ার প্রাথমিক ধারণা।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/time-marker-water-bottle/01.png',
      content:
        'সম্ভব হলে জন্মের পর দ্রুত বুকের দুধ শুরু করতে স্বাস্থ্যকর্মীর সহায়তা নিন। শিশুকে চাহিদা অনুযায়ী দিন ও রাতে খাওয়ান। সঠিকভাবে মুখ লাগানো বা attachment আরামদায়ক feeding-এর জন্য গুরুত্বপূর্ণ।\n\nতীব্র ব্যথা, স্তনে লালভাব বা জ্বর, শিশুর feeding-এ দুর্বলতা, খুব কম প্রস্রাব, অতিরিক্ত ঘুমঘুম ভাব বা ওজন নিয়ে উদ্বেগ থাকলে প্রশিক্ষিত স্বাস্থ্যকর্মী বা lactation support নিন।',
      points: [
        'শিশুর ক্ষুধার প্রাথমিক সংকেত লক্ষ্য করুন',
        'ব্যথা হলে attachment যাচাই করান',
        'নিজের পানি ও পুষ্টিকর খাবার নিশ্চিত করুন',
        'feeding নিয়ে উদ্বেগ হলে দ্রুত সহায়তা নিন',
      ],
      source: {
        label: 'WHO — Breastfeeding',
        url: 'https://www.who.int/health-topics/breastfeeding',
      },
    },
    {
      slug: 'postpartum-rest-and-hygiene',
      categorySlug: 'postpartum-care',
      title: 'প্রসবের পর বিশ্রাম ও ব্যক্তিগত পরিচ্ছন্নতা',
      excerpt:
        'সংক্রমণের ঝুঁকি কমানো এবং ধীরে সুস্থ হওয়ার জন্য সহজ দৈনন্দিন যত্নের অভ্যাস।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/soft-sleep-eye-mask/01.png',
      content:
        'হাত পরিষ্কার রাখা, পরিষ্কার ও শুকনো পোশাক ব্যবহার এবং চিকিৎসকের নির্দেশনা অনুযায়ী ক্ষতস্থান বা সেলাইয়ের যত্ন নিন। কোনো ধরনের রাসায়নিক বা ঘরোয়া উপাদান ক্ষতস্থানে ব্যবহারের আগে চিকিৎসকের পরামর্শ নিন।\n\nশিশু ঘুমালে সম্ভব হলে বিশ্রাম নিন এবং খাবার, ঘরের কাজ ও শিশুর যত্ন ভাগ করে নিতে পরিবারের সাহায্য চান। জ্বর, দুর্গন্ধ, বাড়তে থাকা ব্যথা বা ক্ষতস্থানে অস্বাভাবিক পরিবর্তন হলে চিকিৎসা নিন।',
      points: [
        'ক্ষত স্পর্শের আগে ও পরে হাত ধুয়ে নিন',
        'চিকিৎসকের নির্দেশনা ছাড়া কিছু প্রয়োগ করবেন না',
        'ভারী কাজ ধীরে ধীরে শুরু করুন',
        'জ্বর বা বাড়তে থাকা ব্যথায় চিকিৎসা নিন',
      ],
      source: {
        label: 'WHO — Maternal and newborn postnatal care',
        url: 'https://www.who.int/publications/i/item/9789240045989',
      },
    },
    {
      slug: 'newborn-cord-care',
      categorySlug: 'newborn-care',
      title: 'নবজাতকের নাভির যত্নের সহজ নিয়ম',
      excerpt:
        'নাভির অংশ পরিষ্কার ও শুকনো রাখা এবং সংক্রমণের লক্ষণ দ্রুত শনাক্ত করার সাধারণ নির্দেশনা।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/pregnancy-document-organizer/01.png',
      content:
        'নাভির অবশিষ্ট অংশ পরিষ্কার ও শুকনো রাখুন এবং ডায়াপার এমনভাবে পরান যেন জায়গাটি ভেজা না থাকে। স্পর্শের আগে ও পরে সাবান-পানি দিয়ে হাত ধুয়ে নিন। চিকিৎসকের নির্দেশনা ছাড়া তেল, গুঁড়া, মলম বা ঘরোয়া কিছু লাগাবেন না।\n\nনাভির চারপাশে লালভাব ছড়িয়ে পড়া, পুঁজ, দুর্গন্ধ, রক্তপাত বন্ধ না হওয়া, জ্বর বা শিশুর feeding কমে গেলে দ্রুত চিকিৎসা নিন।',
      points: [
        'নাভি পরিষ্কার ও শুকনো রাখুন',
        'স্পর্শের আগে হাত ধুয়ে নিন',
        'নিজে থেকে কোনো উপাদান লাগাবেন না',
        'লালভাব বা পুঁজ হলে দ্রুত চিকিৎসা নিন',
      ],
      source: {
        label: 'WHO — Maternal and newborn postnatal care',
        url: 'https://www.who.int/publications/i/item/9789240045989',
      },
    },
    {
      slug: 'newborn-bath-guide',
      categorySlug: 'newborn-care',
      title: 'নবজাতককে নিরাপদে গোসল করানোর গাইড',
      excerpt:
        'উষ্ণ ঘর, প্রয়োজনীয় জিনিস প্রস্তুত রাখা এবং শিশুকে সবসময় হাতে ধরে রাখার গুরুত্বপূর্ণ নিয়ম।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/time-marker-water-bottle/01.png',
      content:
        'গোসলের আগে তোয়ালে, পরিষ্কার পোশাক ও প্রয়োজনীয় সবকিছু হাতের কাছে রাখুন। ঘর উষ্ণ রাখুন এবং পানি কনুই বা কবজি দিয়ে পরীক্ষা করে আরামদায়ক উষ্ণ নিশ্চিত করুন।\n\nশিশুকে কখনো এক মুহূর্তের জন্যও পানিতে একা রাখবেন না। এক হাত দিয়ে মাথা ও ঘাড় সমর্থন করুন। গোসল শেষে দ্রুত শুকিয়ে উষ্ণ কাপড়ে জড়িয়ে দিন। ত্বকে অস্বাভাবিক র‍্যাশ বা ক্ষত থাকলে চিকিৎসকের পরামর্শ নিন।',
      points: [
        'সব সামগ্রী আগে থেকে হাতের কাছে রাখুন',
        'পানির তাপমাত্রা হাতে পরীক্ষা করুন',
        'শিশুকে কখনো পানিতে একা রাখবেন না',
        'মাথা ও ঘাড় সবসময় সমর্থন করুন',
      ],
      source: {
        label: 'WHO — Maternal and newborn postnatal care',
        url: 'https://www.who.int/publications/i/item/9789240045989',
      },
    },
    {
      slug: 'safe-sleep-for-newborn',
      categorySlug: 'newborn-care',
      title: 'নবজাতকের নিরাপদ ঘুমের পরিবেশ',
      excerpt:
        'শিশুর ঘুমের জায়গা সমতল, পরিষ্কার ও ঝুঁকিমুক্ত রাখার সহজ checklist।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/soft-sleep-eye-mask/01.png',
      content:
        'শিশুকে পিঠের ওপর শোয়ান এবং শক্ত ও সমতল ঘুমের জায়গা ব্যবহার করুন। শিশুর মুখ ও মাথা খোলা রাখুন। ঘুমের জায়গায় বালিশ, ভারী কম্বল, নরম খেলনা বা ঢিলা কাপড় রাখবেন না।\n\nশিশুকে অতিরিক্ত গরম করবেন না এবং ধোঁয়ামুক্ত পরিবেশ নিশ্চিত করুন। আপনার শিশুর বিশেষ স্বাস্থ্যসমস্যা বা premature birth থাকলে ঘুমের ব্যবস্থা সম্পর্কে শিশুর চিকিৎসকের নির্দেশনা নিন।',
      points: [
        'শিশুকে পিঠের ওপর শোয়ান',
        'শক্ত ও সমতল mattress ব্যবহার করুন',
        'বালিশ ও নরম খেলনা দূরে রাখুন',
        'ঘর ধোঁয়ামুক্ত এবং আরামদায়ক রাখুন',
      ],
      source: {
        label: 'WHO — Maternal and newborn postnatal care',
        url: 'https://www.who.int/publications/i/item/9789240045989',
      },
    },
    {
      slug: 'newborn-danger-signs',
      categorySlug: 'newborn-care',
      title: 'নবজাতকের যেসব লক্ষণে দ্রুত চিকিৎসা প্রয়োজন',
      excerpt:
        'feeding কমে যাওয়া, শ্বাসকষ্ট, জ্বর বা অস্বাভাবিক নিস্তেজতার মতো লক্ষণ অবহেলা করবেন না।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/baby-fetal-doppler/01.png',
      content:
        'নবজাতক দুধ না খেলে বা খুব কম খেলে, দ্রুত বা কষ্ট করে শ্বাস নিলে, খিঁচুনি হলে, অস্বাভাবিক নিস্তেজ থাকলে, শরীর খুব গরম বা ঠান্ডা মনে হলে কিংবা ত্বক বেশি হলুদ বা নীলচে দেখালে দ্রুত চিকিৎসা নিন।\n\nবারবার বমি, নাভিতে পুঁজ বা ছড়িয়ে পড়া লালভাব এবং আচরণে হঠাৎ পরিবর্তনও গুরুত্বের সঙ্গে দেখুন। নবজাতকের অবস্থা দ্রুত বদলাতে পারে, তাই সন্দেহ হলে অপেক্ষা না করে প্রশিক্ষিত চিকিৎসকের মূল্যায়ন নিন।',
      points: [
        'feeding হঠাৎ কমে গেলে সাহায্য নিন',
        'শ্বাসকষ্ট বা নীলচে রং জরুরি লক্ষণ',
        'খিঁচুনি বা অস্বাভাবিক নিস্তেজতায় জরুরি সেবা নিন',
        'অনলাইনের পরামর্শের জন্য চিকিৎসা বিলম্ব করবেন না',
      ],
      source: {
        label: 'WHO — Maternal and newborn postnatal care',
        url: 'https://www.who.int/publications/i/item/9789240045989',
      },
    },
    {
      slug: 'exclusive-breastfeeding-six-months',
      categorySlug: 'baby-nutrition',
      title: 'প্রথম ছয় মাস শুধু বুকের দুধ: যা জানা দরকার',
      excerpt:
        'WHO-এর সাধারণ নির্দেশনা অনুযায়ী exclusive breastfeeding এবং শিশুর চাহিদামতো feeding-এর ধারণা।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/time-marker-water-bottle/01.png',
      content:
        'WHO ও UNICEF সাধারণভাবে জন্মের প্রথম ঘণ্টার মধ্যে বুকের দুধ শুরু এবং প্রথম ছয় মাস শুধু বুকের দুধ দেওয়ার পরামর্শ দেয়। শুধু বুকের দুধ বলতে সাধারণত পানি-সহ অন্য খাবার বা পানীয় না দেওয়া বোঝায়, তবে চিকিৎসকের নির্দেশিত ওষুধ বা বিশেষ পরিস্থিতি আলাদা।\n\nশিশুকে ঘড়ি ধরে নয়, ক্ষুধার সংকেত অনুযায়ী দিন ও রাতে খাওয়ান। feeding, প্রস্রাব, ওজন বা মায়ের ব্যথা নিয়ে উদ্বেগ হলে প্রশিক্ষিত স্বাস্থ্যকর্মীর সহায়তা নিন।',
      points: [
        'সম্ভব হলে জন্মের পর দ্রুত feeding শুরু করুন',
        'শিশুর চাহিদা অনুযায়ী দিন ও রাতে খাওয়ান',
        'নিজে থেকে পানি বা অন্য খাবার শুরু করবেন না',
        'সমস্যা হলে breastfeeding support নিন',
      ],
      source: {
        label: 'WHO — Breastfeeding',
        url: 'https://www.who.int/health-topics/breastfeeding',
      },
    },
    {
      slug: 'complementary-feeding-from-six-months',
      categorySlug: 'baby-nutrition',
      title: 'ছয় মাস থেকে বাড়তি খাবার শুরু করার নিয়ম',
      excerpt:
        'বুকের দুধের পাশাপাশি নিরাপদ, পুষ্টিকর ও বয়স-উপযোগী complementary food শুরু করার প্রাথমিক গাইড।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/time-marker-water-bottle/01.png',
      content:
        'প্রায় ছয় মাস বয়সে শিশুর পুষ্টির প্রয়োজন শুধু বুকের দুধের বাইরে বাড়তে শুরু করে। তখন বুকের দুধ চালিয়ে যাওয়ার পাশাপাশি নরম, নিরাপদ এবং পুষ্টিকর বাড়তি খাবার অল্প পরিমাণে শুরু করা যায়।\n\nশিশুর বয়স ও বিকাশ অনুযায়ী খাবারের ঘনত্ব, পরিমাণ এবং বৈচিত্র্য ধীরে বাড়ান। খাবার তৈরির আগে হাত ধুয়ে নিন, পরিষ্কার বাসন ব্যবহার করুন এবং শিশুকে বসিয়ে নজরদারিতে খাওয়ান। ব্যক্তিগত সমস্যা থাকলে শিশুর চিকিৎসকের পরামর্শ নিন।',
      points: [
        'প্রায় ছয় মাস বয়সে প্রস্তুতির লক্ষণ দেখে শুরু করুন',
        'অল্প পরিমাণ নরম খাবার দিয়ে শুরু করুন',
        'বুকের দুধ চালিয়ে যান',
        'খাবার তৈরি ও পরিবেশনে পরিচ্ছন্নতা বজায় রাখুন',
      ],
      source: {
        label: 'WHO — Infant and young child feeding',
        url: 'https://www.who.int/news-room/fact-sheets/detail/infant-and-young-child-feeding',
      },
    },
    {
      slug: 'responsive-feeding-guide',
      categorySlug: 'baby-nutrition',
      title: 'শিশুর ক্ষুধা ও পেট ভরার সংকেত বুঝুন',
      excerpt:
        'Responsive feeding-এ শিশুর সংকেত দেখে ধৈর্য ধরে খাবার দেওয়া হয়, জোর বা বিভ্রান্তি তৈরি করা হয় না।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/time-marker-water-bottle/01.png',
      content:
        'শিশু খাবারের দিকে আগ্রহ দেখানো, মুখ খোলা বা সামনে ঝোঁকার মাধ্যমে ক্ষুধার সংকেত দিতে পারে। মুখ ফিরিয়ে নেওয়া, মুখ বন্ধ রাখা বা আগ্রহ হারানো পেট ভরার সংকেত হতে পারে। এসব সংকেত লক্ষ্য করে ধীরে ও ধৈর্য ধরে খাওয়ান।\n\nখাবারের সময় শান্ত পরিবেশ রাখুন এবং শিশুকে জোর, ভয় বা শাস্তি দিয়ে খাওয়াবেন না। শিশু বারবার খাবার প্রত্যাখ্যান করলে, গিলতে সমস্যা হলে বা বৃদ্ধি নিয়ে উদ্বেগ থাকলে চিকিৎসকের পরামর্শ নিন।',
      points: [
        'ক্ষুধা ও পেট ভরার সংকেত লক্ষ্য করুন',
        'ধীরে এবং উৎসাহ দিয়ে খাওয়ান',
        'স্ক্রিন বা ভয় দেখিয়ে খাওয়াবেন না',
        'গিলতে সমস্যা হলে চিকিৎসকের পরামর্শ নিন',
      ],
      source: {
        label: 'WHO — Infant and young child feeding',
        url: 'https://www.who.int/news-room/fact-sheets/detail/infant-and-young-child-feeding',
      },
    },
    {
      slug: 'baby-food-hygiene',
      categorySlug: 'baby-nutrition',
      title: 'শিশুর খাবার তৈরিতে পরিচ্ছন্নতার নিয়ম',
      excerpt:
        'হাত, পানি, বাসন এবং সংরক্ষণের পরিচ্ছন্নতা শিশুর খাবার নিরাপদ রাখতে গুরুত্বপূর্ণ।',
      coverImage:
        'https://res.cloudinary.com/dohhfubsa/image/upload/maaniko/products/time-marker-water-bottle/01.png',
      content:
        'শিশুর খাবার তৈরির আগে সাবান-পানি দিয়ে হাত ধুয়ে নিন এবং পরিষ্কার বাসন ও নিরাপদ পানি ব্যবহার করুন। কাঁচা ও রান্না করা খাবার আলাদা রাখুন এবং খাবার ভালোভাবে রান্না করুন।\n\nপ্রস্তুত খাবার দীর্ঘসময় ঘরের তাপমাত্রায় রেখে দেবেন না। সংরক্ষণ করতে হলে নিরাপদ তাপমাত্রা ও সময় সম্পর্কে স্থানীয় স্বাস্থ্য নির্দেশনা অনুসরণ করুন। গন্ধ, রং বা অবস্থায় সন্দেহ হলে সেই খাবার শিশুকে দেবেন না।',
      points: [
        'খাবার তৈরির আগে হাত ধুয়ে নিন',
        'পরিষ্কার বাসন ও নিরাপদ পানি ব্যবহার করুন',
        'কাঁচা ও রান্না করা খাবার আলাদা রাখুন',
        'সন্দেহজনক বা দীর্ঘসময় বাইরে থাকা খাবার দেবেন না',
      ],
      source: {
        label: 'WHO — Infant and young child feeding',
        url: 'https://www.who.int/news-room/fact-sheets/detail/infant-and-young-child-feeding',
      },
    },
  ],
} as const;

async function seedAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  if (!email) return;
  await prisma.user.upsert({
    where: { email },
    update: { role: Role.SUPER_ADMIN, status: Status.APPROVED },
    create: {
      email,
      name: 'সুপার অ্যাডমিন',
      role: Role.SUPER_ADMIN,
      status: Status.APPROVED,
    },
  });
}

async function seedJourneys() {
  for (const journey of catalog.journeys) {
    await prisma.journey.upsert({
      where: { slug: journey.id },
      update: {
        number: journey.number,
        name: journey.name,
        description: journey.description,
        icon: journey.icon,
        color: journey.color,
        softColor: journey.softColor,
      },
      create: {
        slug: journey.id,
        number: journey.number,
        name: journey.name,
        description: journey.description,
        icon: journey.icon,
        color: journey.color,
        softColor: journey.softColor,
      },
    });
  }
}

async function seedProducts() {
  for (const [index, product] of catalog.products.entries()) {
    const categorySlug =
      product.categorySlug ?? slugify(product.category ?? product.category);
    const category = await prisma.category.upsert({
      where: { slug: categorySlug },
      update: { name: product.category },
      create: {
        slug: categorySlug,
        name: product.category,
      },
    });
    const journey = product.journeySlug
      ? await prisma.journey.findUnique({
          where: { slug: product.journeySlug },
        })
      : null;
    const scalar = {
      slug: product.slug,
      sku: `MN-${String(index + 1).padStart(4, '0')}`,
      name: product.name,
      description: product.description,
      badge: product.badge,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      stock: product.stock,
      rating: product.rating,
      reviewCount: product.reviewCount ?? 0,
      status: CatalogStatus.ACTIVE,
      featured: index < 10,
      categoryId: category.id,
    };
    await prisma.product.upsert({
      where: { id: product.id },
      update: scalar,
      create: { id: product.id, ...scalar },
    });
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productIncludedItem.deleteMany({
      where: { productId: product.id },
    });
    await prisma.productBullet.deleteMany({ where: { productId: product.id } });
    await prisma.productJourney.deleteMany({
      where: { productId: product.id },
    });
    await prisma.productImage.createMany({
      data: product.images.map((url: string, sortOrder: number) => ({
        productId: product.id,
        url,
        sortOrder,
      })),
    });
    if (product.details?.includedItems?.length) {
      await prisma.productIncludedItem.createMany({
        data: product.details.includedItems.map(
          (item: any, sortOrder: number) => ({
            productId: product.id,
            name: item.name,
            image: item.image,
            sortOrder,
          }),
        ),
      });
    }
    const bulletData = [
      ...(product.details?.whyEssential ?? []).map(
        (item: any, sortOrder: number) => ({
          productId: product.id,
          kind: ProductBulletKind.WHY_ESSENTIAL,
          text: item,
          sortOrder,
        }),
      ),
      ...(product.details?.preferredFor ?? []).map(
        (item: any, sortOrder: number) => ({
          productId: product.id,
          kind: ProductBulletKind.PREFERRED_FOR,
          text: item,
          sortOrder,
        }),
      ),
    ];
    if (bulletData.length)
      await prisma.productBullet.createMany({ data: bulletData });
    if (journey) {
      await prisma.productJourney.create({
        data: { productId: product.id, journeyId: journey.id },
      });
    }
  }
}

async function seedCombos() {
  for (const [index, combo] of catalog.combos.entries()) {
    const scalar = {
      slug: combo.slug,
      sku: `MN-COMBO-${String(index + 1).padStart(3, '0')}`,
      name: combo.name,
      subtitle: combo.subtitle,
      description: combo.description,
      journeyStage: combo.journeyStage,
      price: combo.price,
      compareAtPrice: combo.compareAtPrice,
      stock: combo.stock,
      rating: combo.rating,
      reviewCount: combo.reviewCount ?? 0,
      status: CatalogStatus.ACTIVE,
    };
    await prisma.combo.upsert({
      where: { id: combo.id },
      update: scalar,
      create: { id: combo.id, ...scalar },
    });
    await prisma.comboImage.deleteMany({ where: { comboId: combo.id } });
    await prisma.comboProduct.deleteMany({ where: { comboId: combo.id } });
    await prisma.comboListItem.deleteMany({ where: { comboId: combo.id } });
    await prisma.comboGuideStep.deleteMany({ where: { comboId: combo.id } });
    await prisma.comboReview.deleteMany({ where: { comboId: combo.id } });
    await prisma.comboFaq.deleteMany({ where: { comboId: combo.id } });
    await prisma.comboImage.createMany({
      data: combo.images.map((url: string, sortOrder: number) => ({
        comboId: combo.id,
        url,
        sortOrder,
      })),
    });
    await prisma.comboProduct.createMany({
      data: combo.items.map((item: any, sortOrder: number) => ({
        comboId: combo.id,
        productId: item.productId,
        quantity: item.quantity,
        variant: item.variant,
        sortOrder,
      })),
    });
    const lists = [
      [ComboListKind.WHY_THIS_BOX, combo.whyThisBox],
      [ComboListKind.PREFERRED_FOR, combo.preferredFor],
      [ComboListKind.SELECTION_REASON, combo.selectionReasons],
      [ComboListKind.PACKAGING, combo.packaging],
    ] as const;
    for (const [kind, values] of lists) {
      if (!values?.length) continue;
      await prisma.comboListItem.createMany({
        data: values.map((item: any, sortOrder: number) => ({
          comboId: combo.id,
          kind,
          text: item,
          sortOrder,
        })),
      });
    }
    if (combo.usageGuide?.length) {
      await prisma.comboGuideStep.createMany({
        data: combo.usageGuide.map((item: any, sortOrder: number) => ({
          comboId: combo.id,
          key: item.id,
          title: item.title,
          description: item.description,
          sortOrder,
        })),
      });
    }
    if (combo.reviews?.length) {
      await prisma.comboReview.createMany({
        data: combo.reviews.map((item: any, sortOrder: number) => ({
          comboId: combo.id,
          customerName: item.customerName,
          rating: item.rating,
          review: item.review,
          sortOrder,
        })),
      });
    }
    if (combo.faqs?.length) {
      await prisma.comboFaq.createMany({
        data: combo.faqs.map((item: any, sortOrder: number) => ({
          comboId: combo.id,
          question: item.question,
          answer: item.answer,
          sortOrder,
        })),
      });
    }
  }
}

async function seedBanners() {
  for (const banner of catalog.banners) {
    const isHome = banner.placement === 'HOME_HERO';
    const key = banner.id;
    const data = {
      placement: banner.placement as BannerPlacement,
      desktopImage: isHome ? banner.imageUrl : banner.desktopImage,
      mobileImage: isHome ? banner.mobileImageUrl : banner.mobileImage,
      eyebrow: banner.eyebrow,
      title: banner.title,
      description: banner.description,
      buttonLabel: banner.buttonLabel,
      link: isHome ? banner.productLink : banner.buttonHref,
      tone: banner.tone,
      isPublished: banner.isPublished ?? true,
      sortOrder: banner.sortOrder ?? 0,
    };
    await prisma.banner.upsert({
      where: { key },
      update: data,
      create: { key, ...data },
    });
  }
}

async function seedGuides() {
  const categoryIds = new Map<string, string>();

  for (const [sortOrder, category] of guideSeed.categories.entries()) {
    const saved = await prisma.guideCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        sortOrder,
        isPublished: true,
      },
      create: {
        ...category,
        sortOrder,
        isPublished: true,
      },
    });
    categoryIds.set(category.slug, saved.id);
  }

  for (const [sortOrder, guide] of guideSeed.guides.entries()) {
    const categoryId = categoryIds.get(guide.categorySlug);
    if (!categoryId)
      throw new Error(`Guide category পাওয়া যায়নি: ${guide.categorySlug}`);

    const readMinutes = Math.max(
      1,
      Math.ceil(
        `${guide.content} ${guide.points.join(' ')}`
          .split(/\s+/)
          .filter(Boolean).length / 180,
      ),
    );
    const publishedAt = new Date(
      Date.UTC(2026, 8, Math.min(sortOrder + 1, 28), 6),
    );
    const data = {
      title: guide.title,
      excerpt: guide.excerpt,
      coverImage: guide.coverImage,
      coverPublicId: null,
      coverAlt: guide.title,
      authorName: 'Maaniko তথ্য সংকলন',
      readMinutes,
      pdfUrl: null,
      pageCount: null,
      status: CatalogStatus.ACTIVE,
      featured: sortOrder < 3,
      popular: sortOrder < 8,
      sortOrder,
      publishedAt,
      reviewedAt: publishedAt,
      categoryId,
    };
    const sections = {
      create: {
        title: 'বিস্তারিত',
        body: guide.content,
        points: [...guide.points],
        sortOrder: 0,
      },
    };
    const sources = {
      create: {
        label: guide.source.label,
        url: guide.source.url,
        sortOrder: 0,
      },
    };

    await prisma.guide.upsert({
      where: { slug: guide.slug },
      update: {
        ...data,
        sections: { deleteMany: {}, ...sections },
        sources: { deleteMany: {}, ...sources },
      },
      create: {
        slug: guide.slug,
        ...data,
        sections,
        sources,
      },
    });
  }
}

async function seedGuidePage() {
  await prisma.guidePage.upsert({
    where: { id: 'main' },
    update: {},
    create: {
      id: 'main',
      content: {
        title: 'মা ও শিশুর যত্নে প্রয়োজনীয় গাইড',
        description:
          'বিশ্বস্ত তথ্য, সহজ নির্দেশনা এবং প্রতিটি পর্যায়ের প্রয়োজনীয় পরামর্শ এক জায়গায়।',
        searchPlaceholder: 'গাইড খুঁজুন',
        trustTitle: 'বিশ্বস্ত তথ্য',
        journeyTitle: 'আপনার প্রয়োজন অনুযায়ী পড়ুন',
        featuredTitle: 'বিশেষ গাইড',
        popularTitle: 'জনপ্রিয় গাইড',
        processTitle: 'আমাদের তথ্য তৈরির প্রক্রিয়া',
        processNote: 'প্রতিটি গাইড প্রকাশের আগে তথ্য যাচাই করা হয়।',
        noticeTitle: 'স্বাস্থ্যবিষয়ক গুরুত্বপূর্ণ নোট',
        noticeText:
          'এই গাইড সাধারণ তথ্যের জন্য। জরুরি বা ব্যক্তিগত চিকিৎসা পরামর্শের জন্য নিবন্ধিত চিকিৎসকের সঙ্গে যোগাযোগ করুন।',
        ctaTitle: 'আরও সাহায্য প্রয়োজন?',
        ctaDescription:
          'আপনার প্রয়োজনীয় পণ্য ও তথ্য খুঁজে পেতে আমাদের সঙ্গে যোগাযোগ করুন।',
        ctaLabel: 'যোগাযোগ করুন',
        trustItems: [
          { icon: 'message', text: 'সহজ ও পরিষ্কার ভাষা' },
          { icon: 'file', text: 'তথ্যসূত্রসহ লেখা' },
          { icon: 'refresh', text: 'নিয়মিত তথ্য হালনাগাদ' },
        ],
        processItems: [
          { icon: 'research', text: 'তথ্য সংগ্রহ' },
          { icon: 'edit', text: 'সহজ ভাষায় সম্পাদনা' },
          { icon: 'check', text: 'প্রকাশের আগে যাচাই' },
        ],
      },
    },
  });
}

async function main() {
  if (process.argv.includes('--pages-only')) {
    await seedContentPages();
    await seedCommerceSettings();
    console.log(
      `${contentPageSeed.length}টি content page এবং custom Solution Box discount setting seed করা হয়েছে।`,
    );
    return;
  }

  if (process.argv.includes('--guides-only')) {
    await seedGuides();
    await seedGuidePage();
    console.log(
      `${guideSeed.categories.length}টি ক্যাটাগরি ও ${guideSeed.guides.length}টি গাইড seed করা হয়েছে।`,
    );
    return;
  }

  await seedAdmin();
  await seedJourneys();
  await seedProducts();
  await seedCombos();
  await seedBanners();
  await seedGuides();
  await seedGuidePage();
  await seedContentPages();
  await seedCommerceSettings();
  console.log(
    `${catalog.products.length}টি পণ্য, ${catalog.combos.length}টি সল্যুশন বক্স, ${catalog.banners.length}টি ব্যানার, ${guideSeed.guides.length}টি গাইড ও ${contentPageSeed.length}টি content page seed করা হয়েছে।`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
