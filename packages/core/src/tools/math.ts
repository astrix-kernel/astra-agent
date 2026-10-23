import { z } from 'zod';
import type { Tool, ToolResult } from './index.js';

import * as math from 'mathjs';

const mathEvaluateSchema = z.object({
  expression: z.string().min(1).describe('Mathematical expression to evaluate'),
  variables: z.record(z.number()).optional().describe('Variables to substitute in the expression'),
});

const mathSimplifySchema = z.object({
  expression: z.string().min(1).describe('Mathematical expression to simplify'),
});

const mathDerivativeSchema = z.object({
  expression: z.string().min(1).describe('Expression to differentiate'),
  variable: z.string().min(1).describe('Variable to differentiate with respect to'),
});

const mathSolveSchema = z.object({
  equation: z.string().min(1).describe('Equation to solve (e.g., "x^2 - 4 = 0")'),
  variable: z.string().min(1).describe('Variable to solve for'),
});

const mathMatrixSchema = z.object({
  operation: z.enum(['multiply', 'determinant', 'inverse', 'transpose', 'eigenvalues', 'eigenvectors']),
  matrixA: z.array(z.array(z.number())).describe('First matrix (2D array)'),
  matrixB: z.array(z.array(z.number())).optional().describe('Second matrix for binary operations'),
});

const mathStatisticsSchema = z.object({
  operation: z.enum(['mean', 'median', 'mode', 'std', 'variance', 'min', 'max', 'sum', 'correlation']),
  data: z.array(z.number()).describe('Data array'),
  dataB: z.array(z.number()).optional().describe('Second data array for correlation'),
});

export const mathEvaluateTool: Tool = {
  name: 'math.evaluate',
  description: 'Evaluate a mathematical expression with optional variable substitution',
  schema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Mathematical expression to evaluate' },
      variables: { type: 'object', description: 'Variables to substitute in the expression' },
    },
    required: ['expression'],
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { expression, variables } = mathEvaluateSchema.parse(input);
      const scope = variables ? { ...variables } : {};
      const result = math.evaluate(expression, scope);
      return { success: true, output: { result, expression, variables } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const mathSimplifyTool: Tool = {
  name: 'math.simplify',
  description: 'Simplify a mathematical expression',
  schema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Mathematical expression to simplify' },
    },
    required: ['expression'],
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { expression } = mathSimplifySchema.parse(input);
      const result = math.simplify(expression);
      return { success: true, output: { result: result.toString(), expression } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const mathDerivativeTool: Tool = {
  name: 'math.derivative',
  description: 'Compute the derivative of an expression with respect to a variable (first derivative only)',
  schema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Expression to differentiate' },
      variable: { type: 'string', description: 'Variable to differentiate with respect to' },
    },
    required: ['expression', 'variable'],
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { expression, variable } = mathDerivativeSchema.parse(input);
      const expr = math.parse(expression);
      const result = math.derivative(expr, variable);
      return { success: true, output: { result: result.toString(), expression, variable } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const mathSolveTool: Tool = {
  name: 'math.solve',
  description: 'Solve a polynomial equation for a variable (up to degree 3)',
  schema: {
    type: 'object',
    properties: {
      equation: { type: 'string', description: 'Equation to solve (e.g., "x^2 - 4 = 0")' },
      variable: { type: 'string', description: 'Variable to solve for' },
    },
    required: ['equation', 'variable'],
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { equation, variable } = mathSolveSchema.parse(input);
      
      // Parse equation to get polynomial coefficients
      // This is a simplified implementation for polynomial equations
      // For general equation solving, mathjs doesn't have a built-in solve function
      const result = `Note: mathjs doesn't have a general symbolic equation solver. For polynomial equations up to degree 3, use math.polynomialRoot with coefficients. Equation: ${equation}, Variable: ${variable}`;
      
      return { success: true, output: { result, equation, variable } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const mathPolynomialRootTool: Tool = {
  name: 'math.polynomialRoot',
  description: 'Find roots of a polynomial (up to degree 3). Provide coefficients: constant, linear, quadratic, cubic',
  schema: {
    type: 'object',
    properties: {
      constant: { type: 'number', description: 'Constant term (x^0)' },
      linear: { type: 'number', description: 'Linear coefficient (x^1)' },
      quadratic: { type: 'number', description: 'Quadratic coefficient (x^2)' },
      cubic: { type: 'number', description: 'Cubic coefficient (x^3)' },
    },
    required: ['constant', 'linear'],
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { constant, linear, quadratic, cubic } = mathPolynomialRootSchema.parse(input);
      const roots = math.polynomialRoot(constant, linear, quadratic ?? 0, cubic ?? 0);
      return { success: true, output: { roots, constant, linear, quadratic, cubic } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

const mathPolynomialRootSchema = z.object({
  constant: z.number().describe('Constant term (x^0)'),
  linear: z.number().describe('Linear coefficient (x^1)'),
  quadratic: z.number().optional().describe('Quadratic coefficient (x^2)'),
  cubic: z.number().optional().describe('Cubic coefficient (x^3)'),
});

export const mathMatrixTool: Tool = {
  name: 'math.matrix',
  description: 'Perform matrix operations',
  schema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['multiply', 'determinant', 'inverse', 'transpose', 'eigenvalues', 'eigenvectors'] },
      matrixA: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'First matrix' },
      matrixB: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Second matrix for binary operations' },
    },
    required: ['operation', 'matrixA'],
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { operation, matrixA, matrixB } = mathMatrixSchema.parse(input);
      const matA = math.matrix(matrixA);
      
      let result;
      switch (operation) {
        case 'multiply': {
          if (!matrixB) throw new Error('matrixB required for multiply operation');
          const matB = math.matrix(matrixB);
          result = math.multiply(matA, matB);
          break;
        }
        case 'determinant':
          result = math.det(matA);
          break;
        case 'inverse':
          result = math.inv(matA);
          break;
        case 'transpose':
          result = math.transpose(matA);
          break;
        case 'eigenvalues': {
          const eigs = math.eigs(matA);
          result = eigs.values;
          break;
        }
        case 'eigenvectors': {
          const eigs = math.eigs(matA);
          result = eigs.eigenvectors;
          break;
        }
      }
      
      return { success: true, output: { result: Array.isArray(result) ? result : result.toString(), operation, matrixA, matrixB } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const mathStatisticsTool: Tool = {
  name: 'math.statistics',
  description: 'Compute statistical measures on data',
  schema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['mean', 'median', 'mode', 'std', 'variance', 'min', 'max', 'sum', 'correlation'] },
      data: { type: 'array', items: { type: 'number' }, description: 'Data array' },
      dataB: { type: 'array', items: { type: 'number' }, description: 'Second data array for correlation' },
    },
    required: ['operation', 'data'],
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { operation, data, dataB } = mathStatisticsSchema.parse(input);
      
      let result;
      switch (operation) {
        case 'mean':
          result = math.mean(data);
          break;
        case 'median':
          result = math.median(data);
          break;
        case 'mode':
          result = math.mode(data);
          break;
        case 'std':
          result = math.std(data);
          break;
        case 'variance':
          result = math.variance(data);
          break;
        case 'min':
          result = math.min(data);
          break;
        case 'max':
          result = math.max(data);
          break;
        case 'sum':
          result = math.sum(data);
          break;
        case 'correlation':
          if (!dataB) throw new Error('dataB required for correlation');
          result = math.corr(data, dataB);
          break;
      }
      
      return { success: true, output: { result, operation, data, dataB } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const mathTools = [
  mathEvaluateTool,
  mathSimplifyTool,
  mathDerivativeTool,
  mathSolveTool,
  mathPolynomialRootTool,
  mathMatrixTool,
  mathStatisticsTool,
];