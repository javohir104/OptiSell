import * as expenseService from '../services/expense.service.js';
import { sendSuccess } from '../utils/response.js';

export async function list(req, res) {
  const { items, meta } = await expenseService.listExpenses(req.user.id, req.valid.query);
  sendSuccess(res, items, { meta });
}

export async function categories(req, res) {
  sendSuccess(res, await expenseService.listCategories(req.user.id));
}

export async function getOne(req, res) {
  sendSuccess(res, await expenseService.getExpense(req.user.id, req.valid.params.id));
}

export async function create(req, res) {
  sendSuccess(res, await expenseService.createExpense(req.user.id, req.valid.body), { status: 201 });
}

export async function update(req, res) {
  sendSuccess(
    res,
    await expenseService.updateExpense(req.user.id, req.valid.params.id, req.valid.body),
  );
}

export async function remove(req, res) {
  sendSuccess(res, await expenseService.deleteExpense(req.user.id, req.valid.params.id));
}
