/**
 * seed.js — mengisi data contoh supaya dashboard tidak kosong saat pertama
 * kali dijalankan. Jalankan dengan: npm run seed
 */
const { groups, books } = require('../src/db/store');

function seedGroups() {
  const defaults = [
    { code: 'Group 1', name: 'Book Sale Group 1', waGroupId: 'WA-GROUP-1' },
    { code: 'Group 2', name: 'Book Sale Group 2', waGroupId: 'WA-GROUP-2' },
    { code: 'Group 6', name: 'Book Sale Group 6', waGroupId: 'WA-GROUP-6' },
  ];
  defaults.forEach((g) => {
    if (!groups.findOne((x) => x.code === g.code)) {
      groups.insert({ ...g, active: true });
      console.log(`Group dibuat: ${g.code}`);
    }
  });
}

function seedBooks() {
  const defaults = [
    {
      title: 'Pop Up Learning All about Animals',
      prefix: 'BB',
      price: 130000,
      nettPrice: 130000,
      stock: 5,
      description: 'Board book pop up tema hewan',
    },
    {
      title: 'Lift the Flap First 100 Animals',
      prefix: 'BB',
      price: 95000,
      nettPrice: 95000,
      stock: 3,
      previewUrl: 'https://youtu.be/example1',
    },
    {
      title: 'Lift the Flap QnA about Food',
      prefix: 'HC',
      publisher: 'Usborne',
      price: 140000,
      nettPrice: 140000,
      stock: 1,
    },
  ];
  defaults.forEach((b) => {
    if (!books.findOne((x) => x.title === b.title)) {
      books.insert({ ...b, status: 'Active' });
      console.log(`Buku dibuat: ${b.title}`);
    }
  });
}

seedGroups();
seedBooks();
console.log('Seeding selesai.');
