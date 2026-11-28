import api, { unwrap } from './axios';
import { clean, fromExpense, getAll, toExpense } from './backend';

/** Expense = { id, category, amount, note, date } */
const real = {
  list: async ({ from, to, category } = {}) =>
    (await getAll('/expenses', clean({ from, to, category, sort: 'expense_date', order: 'desc' }))).map(toExpense),
  create: (payload) => api.post('/expenses', fromExpense(payload)).then(unwrap).then(toExpense),
  update: (id, payload) => api.put(`/expenses/${id}`, fromExpense(payload)).then(unwrap).then(toExpense),
  remove: (id) => api.delete(`/expenses/${id}`).then(unwrap),
};

export const expensesApi = real;
