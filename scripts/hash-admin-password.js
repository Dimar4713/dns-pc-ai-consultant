'use strict';

const crypto = require('crypto');
const readline = require('readline');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function readPassword() {
  const supplied = process.argv.slice(2).join(' ');
  if (supplied) return Promise.resolve(supplied);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Введите пароль администратора: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

readPassword().then((password) => {
  if (password.length < 12) {
    console.error('Пароль должен содержать не менее 12 символов.');
    process.exitCode = 1;
    return;
  }
  console.log(hashPassword(password));
});
