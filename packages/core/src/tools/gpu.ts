import { z } from 'zod';
import type { Tool, ToolResult } from './index.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function safePath(input: string, root: string): string {
  const resolved = path.resolve(root, input);
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path is outside workspace');
  return resolved;
}

const cudaCompileSchema = z.object({
  sourcePath: z.string().min(1).describe('Path to CUDA source file (.cu)'),
  outputPath: z.string().min(1).describe('Output executable or PTX/SASS file'),
  arch: z.string().default('native').describe('GPU architecture (e.g., sm_80, sm_90, native)'),
  optimizationLevel: z.enum(['O0', 'O1', 'O2', 'O3', 'Ofast']).default('O3').describe('Optimization level'),
  includeDirs: z.array(z.string()).optional().describe('Additional include directories'),
  libraries: z.array(z.string()).optional().describe('Libraries to link (e.g., cublas, cudnn, curand)'),
  extraFlags: z.array(z.string()).optional().describe('Extra nvcc flags'),
  generatePtx: z.boolean().default(false).describe('Generate PTX instead of executable'),
  generateSass: z.boolean().default(false).describe('Generate SASS instead of executable'),
});

const cudaProfileSchema = z.object({
  executablePath: z.string().min(1).describe('Path to compiled CUDA executable'),
  args: z.array(z.string()).default([]).describe('Arguments to pass to executable'),
  metrics: z.array(z.string()).optional().describe('Specific metrics to collect'),
  kernels: z.array(z.string()).optional().describe('Specific kernels to profile'),
  outputPath: z.string().optional().describe('Output file for profiling results'),
  duration: z.number().int().positive().max(300).default(60).describe('Profile duration in seconds'),
});

const ncuSchema = z.object({
  executablePath: z.string().min(1).describe('Path to compiled CUDA executable'),
  args: z.array(z.string()).default([]).describe('Arguments to pass to executable'),
  metrics: z.array(z.string()).optional().describe('Specific metrics to collect'),
  kernels: z.array(z.string()).optional().describe('Specific kernels to profile'),
  outputPath: z.string().optional().describe('Output file for NCU log'),
  set: z.string().default('full').describe('Metric set (full, speedoflight, memory, compute, launch)'),
  kernelRegex: z.string().optional().describe('Regex to match kernel names'),
});

const nsysSchema = z.object({
  command: z.string().min(1).describe('Command to profile'),
  args: z.array(z.string()).default([]).describe('Arguments to pass to command'),
  outputPath: z.string().optional().describe('Output qdrep file path'),
  duration: z.number().int().positive().max(300).default(30).describe('Profile duration in seconds'),
  trace: z.array(z.string()).default(['cuda', 'nvtx', 'osrt']).describe('Trace components'),
  cudaGraph: z.boolean().default(false).describe('Enable CUDA Graph profiling'),
});

const tensorrtBuildSchema = z.object({
  onnxPath: z.string().min(1).describe('Path to ONNX model'),
  enginePath: z.string().min(1).describe('Output TensorRT engine path'),
  precision: z.enum(['fp32', 'fp16', 'bf16', 'int8', 'fp8']).default('fp16').describe('Precision mode'),
  workspaceSize: z.number().int().positive().default(1 << 30).describe('Workspace size in bytes'),
  batchSize: z.number().int().positive().optional().describe('Max batch size (for dynamic shapes)'),
  minShapes: z.record(z.array(z.number())).optional().describe('Min input shapes for dynamic'),
  optShapes: z.record(z.array(z.number())).optional().describe('Opt input shapes for dynamic'),
  maxShapes: z.record(z.array(z.number())).optional().describe('Max input shapes for dynamic'),
  timingCache: z.string().optional().describe('Timing cache file'),
  calibrationData: z.string().optional().describe('INT8 calibration data path'),
  calibBatchSize: z.number().int().positive().default(32).describe('Calibration batch size'),
  calibBatches: z.number().int().positive().default(100).describe('Number of calibration batches'),
});

const tensorrtProfileSchema = z.object({
  enginePath: z.string().min(1).describe('Path to TensorRT engine'),
  inputData: z.string().optional().describe('Input data path or random'),
  iterations: z.number().int().positive().default(100).describe('Number of inference iterations'),
  warmup: z.number().int().positive().default(10).describe('Warmup iterations'),
  batchSize: z.number().int().positive().optional().describe('Batch size for profiling'),
});

const hipCompileSchema = z.object({
  sourcePath: z.string().min(1).describe('Path to HIP source file (.hip, .cpp, .cu)'),
  outputPath: z.string().min(1).describe('Output executable or HSACO'),
  arch: z.string().default('gfx90a').describe('AMD GPU architecture (e.g., gfx90a, gfx942, gfx1030)'),
  optimizationLevel: z.enum(['O0', 'O1', 'O2', 'O3', 'Ofast']).default('O3').describe('Optimization level'),
  includeDirs: z.array(z.string()).optional().describe('Additional include directories'),
  libraries: z.array(z.string()).optional().describe('Libraries to link (e.g., rocblas, rocsolver, miopen, rccl)'),
  extraFlags: z.array(z.string()).optional().describe('Extra hipcc flags'),
  generateHsaco: z.boolean().default(false).describe('Generate HSACO instead of executable'),
});

const rocmProfileSchema = z.object({
  executablePath: z.string().min(1).describe('Path to compiled HIP executable'),
  args: z.array(z.string()).default([]).describe('Arguments to pass to executable'),
  outputPath: z.string().optional().describe('Output file for profiling results'),
  metrics: z.array(z.string()).optional().describe('Specific metrics to collect'),
  kernelNames: z.array(z.string()).optional().describe('Specific kernels to profile'),
});

const gpuInfoSchema = z.object({
  vendor: z.enum(['nvidia', 'amd', 'intel', 'all']).default('all').describe('GPU vendor to query'),
  format: z.enum(['json', 'text', 'csv']).default('json').describe('Output format'),
});

const mpsControlSchema = z.object({
  operation: z.enum(['start', 'stop', 'status', 'set_active_thread_percentage']).describe('MPS operation'),
  percentage: z.number().int().min(0).max(100).optional().describe('Active thread percentage (0-100)'),
  serverId: z.string().optional().describe('MPS server ID'),
});

const fabricSchema = z.object({
  operation: z.enum(['topology', 'counters', 'perf', 'config']).describe('Fabric operation'),
  device: z.string().optional().describe('Specific device (e.g., mlx5_0)'),
  duration: z.number().int().positive().max(60).default(10).describe('Duration for perf in seconds'),
});

const dcgmSchema = z.object({
  operation: z.enum(['discover', 'health', 'policy', 'watch', 'diag']).describe('DCGM operation'),
  gpuIds: z.array(z.number()).optional().describe('Specific GPU IDs'),
  duration: z.number().int().positive().max(300).default(60).describe('Watch duration in seconds'),
  policyName: z.string().optional().describe('Policy name for policy operations'),
});

export const cudaCompileTool: Tool = {
  name: 'gpu.cuda.compile',
  description: 'Compile CUDA code with nvcc: generate executables, PTX, or SASS',
  schema: {
    type: 'object',
    properties: {
      sourcePath: { type: 'string', description: 'CUDA source file path' },
      outputPath: { type: 'string', description: 'Output executable or PTX/SASS file' },
      arch: { type: 'string', default: 'native', description: 'GPU architecture (sm_80, sm_90, native)' },
      optimizationLevel: { type: 'string', enum: ['O0', 'O1', 'O2', 'O3', 'Ofast'], default: 'O3' },
      includeDirs: { type: 'array', items: { type: 'string' } },
      libraries: { type: 'array', items: { type: 'string' } },
      extraFlags: { type: 'array', items: { type: 'string' } },
      generatePtx: { type: 'boolean', default: false },
      generateSass: { type: 'boolean', default: false },
    },
    required: ['sourcePath', 'outputPath'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { sourcePath, outputPath, arch, optimizationLevel, includeDirs, libraries, extraFlags, generatePtx, generateSass } = cudaCompileSchema.parse(input);
      const fullSource = safePath(sourcePath, context.workspaceRoot);
      const fullOutput = safePath(outputPath, context.workspaceRoot);
      
      await fs.mkdir(path.dirname(fullOutput), { recursive: true });
      
      const args = [
        fullSource,
        '-o', fullOutput,
        `-${optimizationLevel}`,
        '--std=c++17',
      ];
      
      if (generatePtx) {
        args.push('--ptx');
      } else if (generateSass) {
        args.push('-ptxas-options=-v');
      }
      
      if (arch !== 'native') {
        args.push(`-arch=${arch}`);
      } else {
        args.push('-arch=native');
      }
      
      if (includeDirs) {
        for (const dir of includeDirs) {
          args.push('-I', safePath(dir, context.workspaceRoot));
        }
      }
      
      if (libraries) {
        for (const lib of libraries) {
          args.push(`-l${lib}`);
        }
      }
      
      if (extraFlags) {
        args.push(...extraFlags);
      }
      
      const result = await execFileAsync('nvcc', args, {
        cwd: context.workspaceRoot,
        timeout: 120000,
        maxBuffer: 50_000_000,
      });
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, outputPath: fullOutput } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'nvcc not found. Install CUDA Toolkit.' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const cudaProfileTool: Tool = {
  name: 'gpu.cuda.profile',
  description: 'Profile CUDA executable with nvprof or ncu',
  schema: {
    type: 'object',
    properties: {
      executablePath: { type: 'string', description: 'Compiled CUDA executable path' },
      args: { type: 'array', items: { type: 'string' }, default: [] },
      metrics: { type: 'array', items: { type: 'string' } },
      kernels: { type: 'array', items: { type: 'string' } },
      outputPath: { type: 'string' },
      duration: { type: 'number', default: 60 },
    },
    required: ['executablePath'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { executablePath, args, metrics, kernels, outputPath, duration } = cudaProfileSchema.parse(input);
      const fullExe = safePath(executablePath, context.workspaceRoot);
      const fullOutput = outputPath ? safePath(outputPath, context.workspaceRoot) : path.join(context.workspaceRoot, 'nvprof_output.nvvp');
      
      const nvprofArgs = ['--profile-from-start', 'off', '--unified-memory-profiling', 'per-process-device', '-o', fullOutput];
      
      if (metrics) {
        nvprofArgs.push('--metrics', metrics.join(','));
      }
      
      if (kernels) {
        nvprofArgs.push('--kernel-name', kernels.join(','));
      }
      
      nvprofArgs.push(fullExe, ...args);
      
      const result = await execFileAsync('nvprof', nvprofArgs, {
        cwd: context.workspaceRoot,
        timeout: (duration + 10) * 1000,
        maxBuffer: 100_000_000,
      });
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, profilePath: fullOutput } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'nvprof not found. Install CUDA Toolkit.' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const ncuTool: Tool = {
  name: 'gpu.ncu',
  description: 'Run Nsight Compute (NCU) kernel profiling',
  schema: {
    type: 'object',
    properties: {
      executablePath: { type: 'string', description: 'Compiled CUDA executable path' },
      args: { type: 'array', items: { type: 'string' }, default: [] },
      metrics: { type: 'array', items: { type: 'string' } },
      kernels: { type: 'array', items: { type: 'string' } },
      outputPath: { type: 'string' },
      set: { type: 'string', default: 'full', description: 'Metric set (full, speedoflight, memory, compute, launch)' },
      kernelRegex: { type: 'string' },
    },
    required: ['executablePath'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { executablePath, args, metrics, kernels, outputPath, set, kernelRegex } = ncuSchema.parse(input);
      const fullExe = safePath(executablePath, context.workspaceRoot);
      const fullOutput = outputPath ? safePath(outputPath, context.workspaceRoot) : path.join(context.workspaceRoot, 'ncu_report');
      
      const ncuArgs = [
        '--set', set,
        '--target-processes', 'all',
        '--export', fullOutput,
        '--force-overwrite',
      ];
      
      if (metrics) {
        ncuArgs.push('--metrics', metrics.join(','));
      }
      
      if (kernels) {
        ncuArgs.push('--kernel-name-base', 'demangled', '--kernel-id', '0');
      }
      
      if (kernelRegex) {
        ncuArgs.push('--kernel-regex', kernelRegex);
      }
      
      ncuArgs.push(fullExe, ...args);
      
      const result = await execFileAsync('ncu', ncuArgs, {
        cwd: context.workspaceRoot,
        timeout: 300000,
        maxBuffer: 200_000_000,
      });
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, reportPath: fullOutput + '.log' } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'ncu not found. Install Nsight Compute (part of CUDA Toolkit).' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const nsysTool: Tool = {
  name: 'gpu.nsys',
  description: 'Run Nsight Systems (NSYS) system-wide profiling',
  schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to profile' },
      args: { type: 'array', items: { type: 'string' }, default: [] },
      outputPath: { type: 'string' },
      duration: { type: 'number', default: 30 },
      trace: { type: 'array', items: { type: 'string' }, default: ['cuda', 'nvtx', 'osrt'] },
      cudaGraph: { type: 'boolean', default: false },
    },
    required: ['command'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { command, args, outputPath, duration, trace, cudaGraph } = nsysSchema.parse(input);
      const fullOutput = outputPath ? safePath(outputPath, context.workspaceRoot) : path.join(context.workspaceRoot, 'nsys_report');
      
      const nsysArgs = [
        'profile',
        '--trace', trace.join(','),
        '--output', fullOutput,
        '--force-overwrite', 'true',
        '--duration', String(duration),
      ];
      
      if (cudaGraph) {
        nsysArgs.push('--cudagraph-trace', 'true');
      }
      
      nsysArgs.push(command, ...args);
      
      const result = await execFileAsync('nsys', nsysArgs, {
        cwd: context.workspaceRoot,
        timeout: (duration + 20) * 1000,
        maxBuffer: 200_000_000,
      });
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, reportPath: fullOutput + '.qdrep' } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'nsys not found. Install Nsight Systems.' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const tensorrtBuildTool: Tool = {
  name: 'gpu.tensorrt.build',
  description: 'Build TensorRT engine from ONNX with precision optimization',
  schema: {
    type: 'object',
    properties: {
      onnxPath: { type: 'string', description: 'ONNX model path' },
      enginePath: { type: 'string', description: 'Output TensorRT engine path' },
      precision: { type: 'string', enum: ['fp32', 'fp16', 'bf16', 'int8', 'fp8'], default: 'fp16' },
      workspaceSize: { type: 'number', default: 1073741824 },
      batchSize: { type: 'number' },
      minShapes: { type: 'object' },
      optShapes: { type: 'object' },
      maxShapes: { type: 'object' },
      timingCache: { type: 'string' },
      calibrationData: { type: 'string' },
      calibBatchSize: { type: 'number', default: 32 },
      calibBatches: { type: 'number', default: 100 },
    },
    required: ['onnxPath', 'enginePath'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { onnxPath, enginePath, precision, workspaceSize, batchSize, minShapes, optShapes, maxShapes, timingCache, calibrationData, calibBatchSize, calibBatches } = tensorrtBuildSchema.parse(input);
      const fullOnnx = safePath(onnxPath, context.workspaceRoot);
      const fullEngine = safePath(enginePath, context.workspaceRoot);
      
      await fs.mkdir(path.dirname(fullEngine), { recursive: true });
      
      const script = `
import tensorrt as trt
import sys

logger = trt.Logger(trt.Logger.WARNING)
builder = trt.Builder(logger)
network = builder.create_network(1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH))
parser = trt.OnnxParser(network, logger)

with open('${fullOnnx}', 'rb') as f:
    if not parser.parse(f.read()):
        for error in range(parser.num_errors):
            print(parser.get_error(error))
        sys.exit(1)

config = builder.create_builder_config()
config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, ${workspaceSize})

if '${precision}' == 'fp16':
    config.set_flag(trt.BuilderFlag.FP16)
elif '${precision}' == 'bf16':
    config.set_flag(trt.BuilderFlag.BF16)
elif '${precision}' == 'int8':
    config.set_flag(trt.BuilderFlag.INT8)
    # Calibration would need calibrator implementation
elif '${precision}' == 'fp8':
    config.set_flag(trt.BuilderFlag.FP8)

${batchSize ? `profile = builder.create_optimization_profile()
for name in [${JSON.stringify(Object.keys(minShapes || {}))}]:
    min_shape = ${JSON.stringify(minShapes)}
    opt_shape = ${JSON.stringify(optShapes)}
    max_shape = ${JSON.stringify(maxShapes)}
    profile.set_shape(name, min_shape[name], opt_shape[name], max_shape[name])
config.add_optimization_profile(profile)` : ''}

${timingCache ? `cache = config.create_timing_cache(b'')` : ''}

engine = builder.build_serialized_network(network, config)
if engine is None:
    print('Failed to build engine')
    sys.exit(1)

with open('${fullEngine}', 'wb') as f:
    f.write(engine)

${timingCache ? `with open('${timingCache}', 'wb') as f:
    f.write(cache.serialize())` : ''}

print('Engine built successfully')
`;
      
      const scriptPath = path.join(context.workspaceRoot, 'build_trt.py');
      await fs.writeFile(scriptPath, script);
      
      const result = await execFileAsync('python', [scriptPath], {
        cwd: context.workspaceRoot,
        timeout: 600000,
        maxBuffer: 100_000_000,
      });
      
      await fs.unlink(scriptPath).catch(() => {});
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, enginePath: fullEngine } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const tensorrtProfileTool: Tool = {
  name: 'gpu.tensorrt.profile',
  description: 'Profile TensorRT engine inference performance',
  schema: {
    type: 'object',
    properties: {
      enginePath: { type: 'string', description: 'TensorRT engine path' },
      inputData: { type: 'string', description: 'Input data path or random' },
      iterations: { type: 'number', default: 100 },
      warmup: { type: 'number', default: 10 },
      batchSize: { type: 'number' },
    },
    required: ['enginePath'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { enginePath, inputData, iterations, warmup, batchSize } = tensorrtProfileSchema.parse(input);
      const fullEngine = safePath(enginePath, context.workspaceRoot);
      
      const script = `
import tensorrt as trt
import numpy as np
import time
import sys
import json

logger = trt.Logger(trt.Logger.WARNING)
runtime = trt.Runtime(logger)

with open('${fullEngine}', 'rb') as f:
    engine = runtime.deserialize_cuda_engine(f.read())

context = engine.create_execution_context()

# Get input/output bindings
input_names = []
output_names = []
for i in range(engine.num_io_tensors):
    name = engine.get_tensor_name(i)
    if engine.get_tensor_mode(name) == trt.TensorIOMode.INPUT:
        input_names.append(name)
    else:
        output_names.append(name)

# Set input shapes if dynamic
${batchSize ? `for name in input_names:
    shape = list(context.get_tensor_shape(name))
    shape[0] = ${batchSize}
    context.set_input_shape(name, shape)` : ''}

# Allocate buffers
buffers = {}
for name in input_names + output_names:
    shape = context.get_tensor_shape(name)
    dtype = trt.nptype(engine.get_tensor_dtype(name))
    buffers[name] = np.empty(shape, dtype=dtype)

# Load or generate input data
if '${inputData}':
    data = np.load('${inputData}')
    for name in input_names:
        buffers[name][:] = data
else:
    for name in input_names:
        buffers[name][:] = np.random.randn(*buffers[name].shape).astype(buffers[name].dtype)

# Copy to device (simplified - in practice use cudaMemcpy)
# For profiling, we measure host-to-device + compute + device-to-host

# Warmup
for _ in range(${warmup}):
    for name in input_names:
        context.set_tensor_address(name, buffers[name].ctypes.data)
    for name in output_names:
        context.set_tensor_address(name, buffers[name].ctypes.data)
    context.execute_async_v3(0)

import cuda.cudart as cudart
cudart.cudaDeviceSynchronize()

# Benchmark
times = []
for _ in range(${iterations}):
    start = time.perf_counter()
    for name in input_names:
        context.set_tensor_address(name, buffers[name].ctypes.data)
    for name in output_names:
        context.set_tensor_address(name, buffers[name].ctypes.data)
    context.execute_async_v3(0)
    cudart.cudaDeviceSynchronize()
    end = time.perf_counter()
    times.append((end - start) * 1000)

latencies = np.array(times)
print(json.dumps({
    'mean_latency_ms': float(np.mean(latencies)),
    'median_latency_ms': float(np.median(latencies)),
    'p95_latency_ms': float(np.percentile(latencies, 95)),
    'p99_latency_ms': float(np.percentile(latencies, 99)),
    'min_latency_ms': float(np.min(latencies)),
    'max_latency_ms': float(np.max(latencies)),
    'throughput_samples_per_sec': ${batchSize || 1} * 1000 / float(np.mean(latencies)),
    'iterations': ${iterations},
}))
`;
      
      const scriptPath = path.join(context.workspaceRoot, 'profile_trt.py');
      await fs.writeFile(scriptPath, script);
      
      const result = await execFileAsync('python', [scriptPath], {
        cwd: context.workspaceRoot,
        timeout: 300000,
        maxBuffer: 50_000_000,
      });
      
      await fs.unlink(scriptPath).catch(() => {});
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const hipCompileTool: Tool = {
  name: 'gpu.hip.compile',
  description: 'Compile HIP/ROCm code with hipcc',
  schema: {
    type: 'object',
    properties: {
      sourcePath: { type: 'string', description: 'HIP source file path' },
      outputPath: { type: 'string', description: 'Output executable or HSACO' },
      arch: { type: 'string', default: 'gfx90a', description: 'AMD GPU architecture' },
      optimizationLevel: { type: 'string', enum: ['O0', 'O1', 'O2', 'O3', 'Ofast'], default: 'O3' },
      includeDirs: { type: 'array', items: { type: 'string' } },
      libraries: { type: 'array', items: { type: 'string' } },
      extraFlags: { type: 'array', items: { type: 'string' } },
      generateHsaco: { type: 'boolean', default: false },
    },
    required: ['sourcePath', 'outputPath'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { sourcePath, outputPath, arch, optimizationLevel, includeDirs, libraries, extraFlags, generateHsaco } = hipCompileSchema.parse(input);
      const fullSource = safePath(sourcePath, context.workspaceRoot);
      const fullOutput = safePath(outputPath, context.workspaceRoot);
      
      await fs.mkdir(path.dirname(fullOutput), { recursive: true });
      
      const args = [
        fullSource,
        '-o', fullOutput,
        `-${optimizationLevel}`,
        '--std=c++17',
        `--amdgpu-target=${arch}`,
      ];
      
      if (generateHsaco) {
        args.push('--offload-arch=' + arch);
      }
      
      if (includeDirs) {
        for (const dir of includeDirs) {
          args.push('-I', safePath(dir, context.workspaceRoot));
        }
      }
      
      if (libraries) {
        for (const lib of libraries) {
          args.push(`-l${lib}`);
        }
      }
      
      if (extraFlags) {
        args.push(...extraFlags);
      }
      
      const result = await execFileAsync('hipcc', args, {
        cwd: context.workspaceRoot,
        timeout: 120000,
        maxBuffer: 50_000_000,
      });
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, outputPath: fullOutput } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'hipcc not found. Install ROCm.' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const rocmProfileTool: Tool = {
  name: 'gpu.rocm.profile',
  description: 'Profile HIP/ROCm executable with rocprof',
  schema: {
    type: 'object',
    properties: {
      executablePath: { type: 'string', description: 'Compiled HIP executable path' },
      args: { type: 'array', items: { type: 'string' }, default: [] },
      outputPath: { type: 'string' },
      metrics: { type: 'array', items: { type: 'string' } },
      kernelNames: { type: 'array', items: { type: 'string' } },
    },
    required: ['executablePath'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { executablePath, args, outputPath, metrics, kernelNames } = rocmProfileSchema.parse(input);
      const fullExe = safePath(executablePath, context.workspaceRoot);
      const fullOutput = outputPath ? safePath(outputPath, context.workspaceRoot) : path.join(context.workspaceRoot, 'rocprof_output');
      
      const rocprofArgs = ['--output', fullOutput];
      
      if (metrics) {
        rocprofArgs.push('--metrics', metrics.join(','));
      }
      
      if (kernelNames) {
        rocprofArgs.push('--kernels', kernelNames.join(','));
      }
      
      rocprofArgs.push(fullExe, ...args);
      
      const result = await execFileAsync('rocprof', rocprofArgs, {
        cwd: context.workspaceRoot,
        timeout: 120000,
        maxBuffer: 100_000_000,
      });
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, profilePath: fullOutput } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'rocprof not found. Install ROCm profiler.' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const gpuInfoTool: Tool = {
  name: 'gpu.info',
  description: 'Get GPU information (NVIDIA: nvidia-smi, AMD: rocm-smi, Intel: intel_gpu_top)',
  schema: {
    type: 'object',
    properties: {
      vendor: { type: 'string', enum: ['nvidia', 'amd', 'intel', 'all'], default: 'all' },
      format: { type: 'string', enum: ['json', 'text', 'csv'], default: 'json' },
    },
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { vendor, format } = gpuInfoSchema.parse(input);
      const results: Record<string, unknown> = {};
      
      if (vendor === 'nvidia' || vendor === 'all') {
        try {
          const args = format === 'json' ? ['-q', '-x'] : ['-q'];
          const result = await execFileAsync('nvidia-smi', args, { timeout: 30000 });
          results['nvidia'] = format === 'json' ? JSON.parse(result.stdout) : result.stdout;
        } catch (e) {
          results['nvidia'] = { error: 'nvidia-smi not available' };
        }
      }
      
      if (vendor === 'amd' || vendor === 'all') {
        try {
          const args = format === 'json' ? ['--json'] : ['-a'];
          const result = await execFileAsync('rocm-smi', args, { timeout: 30000 });
          results['amd'] = format === 'json' ? JSON.parse(result.stdout) : result.stdout;
        } catch (e) {
          results['amd'] = { error: 'rocm-smi not available' };
        }
      }
      
      if (vendor === 'intel' || vendor === 'all') {
        try {
          const result = await execFileAsync('intel_gpu_top', ['-J', '-o', '-'], { timeout: 30000 });
          results['intel'] = format === 'json' ? JSON.parse(result.stdout) : result.stdout;
        } catch (e) {
          results['intel'] = { error: 'intel_gpu_top not available' };
        }
      }
      
      return { success: true, output: results };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const mpsControlTool: Tool = {
  name: 'gpu.mps',
  description: 'Control NVIDIA Multi-Process Service (MPS)',
  schema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['start', 'stop', 'status', 'set_active_thread_percentage'] },
      percentage: { type: 'number', minimum: 0, maximum: 100 },
      serverId: { type: 'string' },
    },
    required: ['operation'],
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { operation, percentage, serverId } = mpsControlSchema.parse(input);
      const serverEnv = serverId ? { CUDA_MPS_PIPE_DIRECTORY: "/tmp/nvidia-mps-" + serverId } : {};
      
      let result;
      switch (operation) {
        case 'start': {
          result = await execFileAsync('nvidia-cuda-mps-control', ['-d'], { env: { ...process.env, ...serverEnv } });
          break;
        }
        case 'stop': {
          result = await execFileAsync('echo', ['quit'], { env: { ...process.env, ...serverEnv } });
          await execFileAsync('nvidia-cuda-mps-control', ['quit'], { env: { ...process.env, ...serverEnv } });
          break;
        }
        case 'status': {
          result = await execFileAsync('echo', ['get_server_list'], { env: { ...process.env, ...serverEnv } });
          break;
        }
        case 'set_active_thread_percentage': {
          if (percentage === undefined) {
            return { success: false, error: 'percentage required for set_active_thread_percentage' };
          }
          result = await execFileAsync('echo', ['set_active_thread_percentage', String(percentage)], { env: { ...process.env, ...serverEnv } });
          break;
        }
      }
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, operation } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'nvidia-cuda-mps-control not found. Enable MPS in nvidia-smi.' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const fabricTool: Tool = {
  name: 'gpu.fabric',
  description: 'Query and configure NVIDIA NVLink/NVSwitch or AMD xGMI fabric',
  schema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['topology', 'counters', 'perf', 'config'] },
      device: { type: 'string' },
      duration: { type: 'number', default: 10 },
    },
    required: ['operation'],
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { operation, device, duration } = fabricSchema.parse(input);
      
      let result;
      switch (operation) {
        case 'topology': {
          result = await execFileAsync('nvidia-smi', ['nvlink', '-c'], { timeout: 30000 });
          break;
        }
        case 'counters': {
          result = await execFileAsync('nvidia-smi', ['nvlink', '-s'], { timeout: 30000 });
          break;
        }
        case 'perf': {
          result = await execFileAsync('nvidia-smi', ['nvlink', '-p', String(duration)], { timeout: (duration + 10) * 1000 });
          break;
        }
        case 'config': {
          result = await execFileAsync('nvidia-smi', ['nvlink', '-g'], { timeout: 30000 });
          break;
        }
      }
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, operation } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'nvidia-smi not found' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const dcgmTool: Tool = {
  name: 'gpu.dcgm',
  description: 'Use NVIDIA DCGM for GPU monitoring, diagnostics, and policy management',
  schema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['discover', 'health', 'policy', 'watch', 'diag'] },
      gpuIds: { type: 'array', items: { type: 'number' } },
      duration: { type: 'number', default: 60 },
      policyName: { type: 'string' },
    },
    required: ['operation'],
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { operation, gpuIds, duration, policyName } = dcgmSchema.parse(input);
      
      let result;
      switch (operation) {
        case 'discover': {
          result = await execFileAsync('dcgmi', ['discover', '-l'], { timeout: 30000 });
          break;
        }
        case 'health': {
          const gpuArg = gpuIds ? '-i ' + gpuIds.join(',') : '';
          result = await execFileAsync('dcgmi', ['health', '-g', gpuArg], { timeout: 60000 });
          break;
        }
        case 'policy': {
          if (!policyName) {
            return { success: false, error: 'policyName required for policy operation' };
          }
          result = await execFileAsync('dcgmi', ['policy', '-g', '0', '-P', policyName], { timeout: 60000 });
          break;
        }
        case 'watch': {
          const gpuArg = gpuIds ? '-i ' + gpuIds.join(',') : '';
          result = await execFileAsync('dcgmi', ['dmon', '-g', gpuArg, '-d', String(duration), '-e', '1000'], { timeout: (duration + 10) * 1000 });
          break;
        }
        case 'diag': {
          result = await execFileAsync('dcgmi', ['diag', '-r', '1'], { timeout: 120000 });
          break;
        }
      }
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, operation } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'dcgmi not found. Install DCGM (datacenter-gpu-manager).' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const gpuTools = [
  cudaCompileTool,
  cudaProfileTool,
  ncuTool,
  nsysTool,
  tensorrtBuildTool,
  tensorrtProfileTool,
  hipCompileTool,
  rocmProfileTool,
  gpuInfoTool,
  mpsControlTool,
  fabricTool,
  dcgmTool,
];