import { z } from 'zod';
import type { Tool, ToolResult } from './index.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

function safePath(input: string, root: string): string {
  const resolved = path.resolve(root, input);
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path is outside workspace');
  return resolved;
}

const modelTrainSchema = z.object({
  framework: z.enum(['pytorch', 'tensorflow', 'jax', 'huggingface']).describe('ML framework'),
  script: z.string().min(1).describe('Training script path'),
  config: z.string().optional().describe('Config file path'),
  dataDir: z.string().optional().describe('Data directory'),
  outputDir: z.string().min(1).describe('Output directory for checkpoints/logs'),
  gpus: z.number().int().positive().default(1).describe('Number of GPUs'),
  distributed: z.boolean().default(false).describe('Use distributed training'),
  mixedPrecision: z.boolean().default(true).describe('Use mixed precision (FP16/BF16)'),
  epochs: z.number().int().positive().optional().describe('Number of epochs'),
  batchSize: z.number().int().positive().optional().describe('Batch size per GPU'),
  learningRate: z.number().positive().optional().describe('Learning rate'),
  resumeFrom: z.string().optional().describe('Resume from checkpoint'),
});

const modelInferenceSchema = z.object({
  modelPath: z.string().min(1).describe('Path to model (PyTorch, ONNX, TensorRT, GGUF, etc.)'),
  inputData: z.string().min(1).describe('Input data path or JSON string'),
  backend: z.enum(['pytorch', 'onnx', 'tensorrt', 'llama.cpp', 'vllm', 'tgi', 'openvino']).describe('Inference backend'),
  batchSize: z.number().int().positive().default(1).describe('Batch size'),
  quantization: z.enum(['none', 'int8', 'int4', 'fp8', 'gptq', 'awq', 'gguf']).default('none').describe('Quantization method'),
  device: z.enum(['cuda', 'cpu', 'mps', 'xpu']).default('cuda').describe('Target device'),
  maxTokens: z.number().int().positive().optional().describe('Max tokens for generation'),
  temperature: z.number().min(0).max(2).default(1.0).describe('Sampling temperature'),
});

const modelExportSchema = z.object({
  modelPath: z.string().min(1).describe('Source model path'),
  outputPath: z.string().min(1).describe('Output model path'),
  format: z.enum(['onnx', 'tensorrt', 'torchscript', 'openvino', 'coreml', 'tflite']).describe('Export format'),
  inputShape: z.array(z.number()).optional().describe('Input tensor shape (e.g., [1, 3, 224, 224])'),
  opset: z.number().int().positive().default(17).describe('ONNX opset version'),
  dynamicAxes: z.record(z.array(z.string())).optional().describe('Dynamic axes for ONNX'),
  quantization: z.enum(['none', 'int8', 'fp16']).default('none').describe('Post-training quantization'),
});

const modelBenchmarkSchema = z.object({
  modelPath: z.string().min(1).describe('Model path'),
  backend: z.enum(['pytorch', 'onnx', 'tensorrt', 'llama.cpp', 'vllm', 'tgi']).describe('Inference backend'),
  batchSizes: z.array(z.number().int().positive()).default([1, 2, 4, 8, 16, 32]).describe('Batch sizes to test'),
  sequenceLengths: z.array(z.number().int().positive()).default([128, 512, 1024, 2048, 4096]).describe('Sequence lengths to test'),
  warmupRuns: z.number().int().positive().default(10).describe('Warmup runs'),
  benchmarkRuns: z.number().int().positive().default(100).describe('Benchmark runs'),
  device: z.enum(['cuda', 'cpu']).default('cuda').describe('Device'),
  precision: z.enum(['fp32', 'fp16', 'bf16', 'int8']).default('fp16').describe('Precision'),
});

const dataProcessSchema = z.object({
  operation: z.enum(['tokenize', 'encode', 'split', 'augment', 'statistics', 'deduplicate', 'filter']).describe('Data processing operation'),
  inputPath: z.string().min(1).describe('Input data path'),
  outputPath: z.string().min(1).describe('Output data path'),
  tokenizer: z.string().optional().describe('Tokenizer path or HF model ID'),
  config: z.record(z.unknown()).optional().describe('Operation-specific config'),
});

const experimentTrackSchema = z.object({
  operation: z.enum(['init', 'log', 'compare', 'list', 'delete']).describe('Experiment tracking operation'),
  experimentName: z.string().min(1).describe('Experiment name'),
  runName: z.string().optional().describe('Run name'),
  params: z.record(z.unknown()).optional().describe('Hyperparameters to log'),
  metrics: z.record(z.number()).optional().describe('Metrics to log'),
  artifacts: z.array(z.string()).optional().describe('Artifact paths to log'),
  backend: z.enum(['mlflow', 'wandb', 'tensorboard', 'clearml', 'neptune']).default('mlflow').describe('Tracking backend'),
});

const hpoSchema = z.object({
  studyName: z.string().min(1).describe('Study name'),
  objective: z.string().min(1).describe('Objective metric to optimize (e.g., val_loss, accuracy)'),
  direction: z.enum(['minimize', 'maximize']).default('minimize').describe('Optimization direction'),
  paramSpace: z.record(z.object({
    type: z.enum(['float', 'int', 'categorical']),
    low: z.number().optional(),
    high: z.number().optional(),
    choices: z.array(z.unknown()).optional(),
    log: z.boolean().optional(),
  })).describe('Parameter search space'),
  nTrials: z.number().int().positive().default(100).describe('Number of trials'),
  sampler: z.enum(['tpe', 'random', 'cmaes', 'grid']).default('tpe').describe('Sampler algorithm'),
  pruner: z.enum(['median', 'hyperband', 'none']).default('median').describe('Pruner'),
  storage: z.string().optional().describe('Optuna storage URL (e.g., sqlite:///study.db)'),
});

export const modelTrainTool: Tool = {
  name: 'ai.train',
  description: 'Train ML models with PyTorch, TensorFlow, JAX, or HuggingFace',
  schema: {
    type: 'object',
    properties: {
      framework: { type: 'string', enum: ['pytorch', 'tensorflow', 'jax', 'huggingface'] },
      script: { type: 'string', description: 'Training script path' },
      config: { type: 'string', description: 'Config file path' },
      dataDir: { type: 'string', description: 'Data directory' },
      outputDir: { type: 'string', description: 'Output directory' },
      gpus: { type: 'number', default: 1 },
      distributed: { type: 'boolean', default: false },
      mixedPrecision: { type: 'boolean', default: true },
      epochs: { type: 'number' },
      batchSize: { type: 'number' },
      learningRate: { type: 'number' },
      resumeFrom: { type: 'string' },
    },
    required: ['framework', 'script', 'outputDir'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { framework, script, config, dataDir, outputDir, gpus, distributed, mixedPrecision, epochs, batchSize, learningRate, resumeFrom } = modelTrainSchema.parse(input);
      const fullScript = safePath(script, context.workspaceRoot);
      const fullOutput = safePath(outputDir, context.workspaceRoot);
      
      await fs.mkdir(fullOutput, { recursive: true });
      
      let cmd: string;
      let args: string[] = [];
      const env = { ...process.env };
      
      if (framework === 'pytorch') {
        cmd = 'python';
        if (distributed && gpus > 1) {
          cmd = 'torchrun';
          args = ['--nproc_per_node', String(gpus), '--master_port', '29500', fullScript];
        } else {
          args = [fullScript];
        }
      } else if (framework === 'huggingface') {
        cmd = 'accelerate';
        args = ['launch'];
        if (distributed && gpus > 1) {
          args.push('--num_processes', String(gpus));
        }
        args.push(fullScript);
      } else if (framework === 'tensorflow') {
        cmd = 'python';
        args = [fullScript];
      } else if (framework === 'jax') {
        cmd = 'python';
        args = [fullScript];
      } else {
        return { success: false, error: `Unknown framework: ${framework}` };
      }
      
      if (config) args.push('--config', safePath(config, context.workspaceRoot));
      if (dataDir) args.push('--data_dir', safePath(dataDir, context.workspaceRoot));
      if (outputDir) args.push('--output_dir', fullOutput);
      if (epochs) args.push('--epochs', String(epochs));
      if (batchSize) args.push('--batch_size', String(batchSize));
      if (learningRate) args.push('--learning_rate', String(learningRate));
      if (resumeFrom) args.push('--resume_from', safePath(resumeFrom, context.workspaceRoot));
      if (mixedPrecision) args.push('--mixed_precision');
      
      env['PYTHONPATH'] = context.workspaceRoot + ':' + (env['PYTHONPATH'] || '');
      
      const result = await execFileAsync(cmd, args, { 
        cwd: context.workspaceRoot,
        env,
        timeout: 86400000,
        maxBuffer: 100_000_000,
      });
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, outputDir: fullOutput } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const modelInferenceTool: Tool = {
  name: 'ai.infer',
  description: 'Run inference with various backends (PyTorch, ONNX, TensorRT, llama.cpp, vLLM, TGI)',
  schema: {
    type: 'object',
    properties: {
      modelPath: { type: 'string', description: 'Model path' },
      inputData: { type: 'string', description: 'Input data path or JSON' },
      backend: { type: 'string', enum: ['pytorch', 'onnx', 'tensorrt', 'llama.cpp', 'vllm', 'tgi', 'openvino'] },
      batchSize: { type: 'number', default: 1 },
      quantization: { type: 'string', enum: ['none', 'int8', 'int4', 'fp8', 'gptq', 'awq', 'gguf'], default: 'none' },
      device: { type: 'string', enum: ['cuda', 'cpu', 'mps', 'xpu'], default: 'cuda' },
      maxTokens: { type: 'number' },
      temperature: { type: 'number', default: 1.0 },
    },
    required: ['modelPath', 'inputData', 'backend'],
  },
  async execute(input, context): Promise<ToolResult> {
    const { modelPath, inputData, backend, batchSize, quantization, maxTokens, temperature } = modelInferenceSchema.parse(input);
    const fullModel = safePath(modelPath, context.workspaceRoot);
    const _backend = backend;
    
    try {
      
      let result;
      if (backend === 'llama.cpp') {
        const args = ['-m', fullModel, '-p', inputData, '-n', String(maxTokens || 512), '--temp', String(temperature), '-b', String(batchSize)];
        if (quantization !== 'none') args.push('--quantize', quantization);
        result = await execFileAsync('llama-cli', args, { timeout: 120000, maxBuffer: 50_000_000 });
      } else if (backend === 'vllm') {
        const args = ['--model', fullModel, '--prompt', inputData, '--max-tokens', String(maxTokens || 512), '--temperature', String(temperature)];
        if (quantization !== 'none') args.push('--quantization', quantization);
        result = await execFileAsync('python', ['-m', 'vllm.entrypoints.openai.api_server', ...args], { timeout: 120000 });
      } else if (backend === 'onnx') {
        return { success: false, error: 'ONNX inference requires custom script. Use model.infer with pytorch backend and export to ONNX first.' };
      } else {
        return { success: false, error: `Backend ${backend} not fully implemented. Use llama.cpp or vllm for LLMs, or custom script for other models.` };
      }
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr } };
    } catch (error) {
      const e = error as { code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: `${_backend} not installed` };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const modelExportTool: Tool = {
  name: 'ai.export',
  description: 'Export models to ONNX, TensorRT, TorchScript, OpenVINO, CoreML, TFLite',
  schema: {
    type: 'object',
    properties: {
      modelPath: { type: 'string', description: 'Source model path' },
      outputPath: { type: 'string', description: 'Output model path' },
      format: { type: 'string', enum: ['onnx', 'tensorrt', 'torchscript', 'openvino', 'coreml', 'tflite'] },
      inputShape: { type: 'array', items: { type: 'number' } },
      opset: { type: 'number', default: 17 },
      dynamicAxes: { type: 'object' },
      quantization: { type: 'string', enum: ['none', 'int8', 'fp16'], default: 'none' },
    },
    required: ['modelPath', 'outputPath', 'format'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { modelPath, outputPath, format, inputShape, opset, dynamicAxes, quantization } = modelExportSchema.parse(input);
      const fullModel = safePath(modelPath, context.workspaceRoot);
      const fullOutput = safePath(outputPath, context.workspaceRoot);
      
      await fs.mkdir(path.dirname(fullOutput), { recursive: true });
      
      if (format === 'onnx') {
        const script = `
import torch
import torch.onnx

model = torch.load('${fullModel}', map_location='cpu')
model.eval()

dummy_input = torch.randn(${inputShape ? inputShape.join(',') : '1, 3, 224, 224'})

torch.onnx.export(
    model,
    dummy_input,
    '${fullOutput}',
    export_params=True,
    opset_version=${opset},
    do_constant_folding=True,
    input_names=['input'],
    output_names=['output'],
    dynamic_axes=${JSON.stringify(dynamicAxes || {'input': [0], 'output': [0]})}
)
print('Exported to ONNX')
`;
        const scriptPath = path.join(context.workspaceRoot, 'export_onnx.py');
        await fs.writeFile(scriptPath, script);
        const result = await execFileAsync('python', [scriptPath], { timeout: 120000 });
        await fs.unlink(scriptPath).catch(() => {});
        return { success: true, output: { stdout: result.stdout, stderr: result.stderr, outputPath: fullOutput } };
      } else if (format === 'torchscript') {
        const script = `
import torch
model = torch.load('${fullModel}', map_location='cpu')
model.eval()
scripted = torch.jit.script(model)
scripted.save('${fullOutput}')
print('Exported to TorchScript')
`;
        const scriptPath = path.join(context.workspaceRoot, 'export_ts.py');
        await fs.writeFile(scriptPath, script);
        const result = await execFileAsync('python', [scriptPath], { timeout: 120000 });
        await fs.unlink(scriptPath).catch(() => {});
        return { success: true, output: { stdout: result.stdout, stderr: result.stderr, outputPath: fullOutput } };
      } else if (format === 'tensorrt') {
        return { success: false, error: 'TensorRT export requires trtexec or ONNX + TensorRT optimization. Export to ONNX first, then use trtexec.' };
      } else {
        return { success: false, error: `Format ${format} not implemented. Supported: onnx, torchscript. For tensorrt/openvino/coreml/tflite, use dedicated tools.` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const modelBenchmarkTool: Tool = {
  name: 'ai.benchmark',
  description: 'Benchmark model inference: latency, throughput, memory across batch sizes and sequence lengths',
  schema: {
    type: 'object',
    properties: {
      modelPath: { type: 'string', description: 'Model path' },
      backend: { type: 'string', enum: ['pytorch', 'onnx', 'tensorrt', 'llama.cpp', 'vllm', 'tgi'] },
      batchSizes: { type: 'array', items: { type: 'number' }, default: [1, 2, 4, 8, 16, 32] },
      sequenceLengths: { type: 'array', items: { type: 'number' }, default: [128, 512, 1024, 2048, 4096] },
      warmupRuns: { type: 'number', default: 10 },
      benchmarkRuns: { type: 'number', default: 100 },
      device: { type: 'string', enum: ['cuda', 'cpu'], default: 'cuda' },
      precision: { type: 'string', enum: ['fp32', 'fp16', 'bf16', 'int8'], default: 'fp16' },
    },
    required: ['modelPath', 'backend'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { modelPath, backend, batchSizes, sequenceLengths, warmupRuns, benchmarkRuns, device, precision } = modelBenchmarkSchema.parse(input);
      const fullModel = safePath(modelPath, context.workspaceRoot);
      
      const script = `
import time
import torch
import json
import sys

device = '${device}'
precision = '${precision}'

if precision == 'fp16':
    torch.set_default_dtype(torch.float16)
elif precision == 'bf16':
    torch.set_default_dtype(torch.bfloat16)

model = torch.load('${fullModel}', map_location=device)
model.eval()

results = {}
for batch in ${JSON.stringify(batchSizes)}:
    for seq_len in ${JSON.stringify(sequenceLengths)}:
        dummy = torch.randint(0, 32000, (batch, seq_len), device=device)
        
        # Warmup
        for _ in range(${warmupRuns}):
            with torch.no_grad():
                _ = model(dummy)
        
        # Benchmark
        torch.cuda.synchronize() if device == 'cuda' else None
        start = time.perf_counter()
        for _ in range(${benchmarkRuns}):
            with torch.no_grad():
                _ = model(dummy)
        torch.cuda.synchronize() if device == 'cuda' else None
        end = time.perf_counter()
        
        total_time = end - start
        per_run = total_time / ${benchmarkRuns} * 1000  # ms
        throughput = batch * ${benchmarkRuns} / total_time  # samples/sec
        
        results[f'batch_{batch}_seq_{seq_len}'] = {
            'latency_ms': per_run,
            'throughput_samples_sec': throughput,
            'batch_size': batch,
            'seq_len': seq_len,
        }
        print(f'Batch {batch}, Seq {seq_len}: {per_run:.2f}ms, {throughput:.2f} samples/sec')

print(json.dumps(results, indent=2))
`;
      const scriptPath = path.join(context.workspaceRoot, 'benchmark.py');
      await fs.writeFile(scriptPath, script);
      const result = await execFileAsync('python', [scriptPath], { timeout: 300000 });
      await fs.unlink(scriptPath).catch(() => {});
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const dataProcessTool: Tool = {
  name: 'ai.data',
  description: 'Process ML datasets: tokenize, encode, split, augment, statistics, deduplicate, filter',
  schema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['tokenize', 'encode', 'split', 'augment', 'statistics', 'deduplicate', 'filter'] },
      inputPath: { type: 'string', description: 'Input data path' },
      outputPath: { type: 'string', description: 'Output data path' },
      tokenizer: { type: 'string', description: 'Tokenizer path or HF model ID' },
      config: { type: 'object', description: 'Operation-specific config' },
    },
    required: ['operation', 'inputPath', 'outputPath'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { operation, inputPath, outputPath, tokenizer, config } = dataProcessSchema.parse(input);
      const fullInput = safePath(inputPath, context.workspaceRoot);
      const fullOutput = safePath(outputPath, context.workspaceRoot);
      
      await fs.mkdir(path.dirname(fullOutput), { recursive: true });
      
      let script = '';
      if (operation === 'tokenize' && tokenizer) {
        script = `
from transformers import AutoTokenizer
import json

tokenizer = AutoTokenizer.from_pretrained('${tokenizer}')
with open('${fullInput}', 'r') as f:
    data = [json.loads(line) for line in f]

texts = [item['text'] for item in data]
encoded = tokenizer(texts, padding=True, truncation=True, max_length=${(config?.['max_length'] as number) || 2048}, return_tensors='pt')

import torch
torch.save(encoded, '${fullOutput}')
print(f'Tokenized {len(texts)} samples')
`;
      } else if (operation === 'statistics') {
        script = `
import json
import statistics

with open('${fullInput}', 'r') as f:
    data = [json.loads(line) for line in f]

lengths = [len(item.get('text', '')) for item in data]
stats = {
    'count': len(data),
    'avg_length': statistics.mean(lengths) if lengths else 0,
    'median_length': statistics.median(lengths) if lengths else 0,
    'min_length': min(lengths) if lengths else 0,
    'max_length': max(lengths) if lengths else 0,
    'total_chars': sum(lengths),
}

with open('${fullOutput}', 'w') as f:
    json.dump(stats, f, indent=2)
print(json.dumps(stats, indent=2))
`;
      } else if (operation === 'split') {
        const trainRatio = (config?.['train_ratio'] as number) || 0.8;
        const valRatio = (config?.['val_ratio'] as number) || 0.1;
        script = `
import json
import random

with open('${fullInput}', 'r') as f:
    data = [json.loads(line) for line in f]

random.shuffle(data)
n = len(data)
train_end = int(n * ${trainRatio})
val_end = train_end + int(n * ${valRatio})

splits = {
    'train': data[:train_end],
    'val': data[train_end:val_end],
    'test': data[val_end:],
}

for split_name, split_data in splits.items():
    with open(f'${fullOutput}.{split_name}.jsonl', 'w') as f:
        for item in split_data:
            f.write(json.dumps(item) + '\\n')
    print(f'{split_name}: {len(split_data)} samples')
`;
      } else if (operation === 'deduplicate') {
        script = `
import json
import hashlib

seen = set()
unique = []

with open('${fullInput}', 'r') as f:
    for line in f:
        item = json.loads(line)
        text = item.get('text', '')
        h = hashlib.sha256(text.encode()).hexdigest()
        if h not in seen:
            seen.add(h)
            unique.append(item)

with open('${fullOutput}', 'w') as f:
    for item in unique:
        f.write(json.dumps(item) + '\\n')
print(f'Original: {len(seen) + len(unique) - len(seen)} -> Unique: {len(unique)}')
`;
      } else {
        return { success: false, error: `Operation ${operation} not implemented` };
      }
      
      const scriptPath = path.join(context.workspaceRoot, `data_${operation}.py`);
      await fs.writeFile(scriptPath, script);
      const result = await execFileAsync('python', [scriptPath], { timeout: 300000 });
      await fs.unlink(scriptPath).catch(() => {});
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, outputPath: fullOutput } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const experimentTrackTool: Tool = {
  name: 'ai.experiment',
  description: 'Track ML experiments: init, log params/metrics/artifacts, compare runs',
  schema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['init', 'log', 'compare', 'list', 'delete'] },
      experimentName: { type: 'string', description: 'Experiment name' },
      runName: { type: 'string', description: 'Run name' },
      params: { type: 'object', description: 'Hyperparameters' },
      metrics: { type: 'object', description: 'Metrics' },
      artifacts: { type: 'array', items: { type: 'string' }, description: 'Artifact paths' },
      backend: { type: 'string', enum: ['mlflow', 'wandb', 'tensorboard', 'clearml', 'neptune'], default: 'mlflow' },
    },
    required: ['operation', 'experimentName'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { operation, experimentName, runName, params, metrics, artifacts, backend } = experimentTrackSchema.parse(input);
      
      if (backend === 'mlflow') {
        let script = '';
        if (operation === 'init') {
          script = `import mlflow; mlflow.set_experiment('${experimentName}'); print('Experiment initialized')`;
        } else if (operation === 'log') {
          script = `
import mlflow
mlflow.set_experiment('${experimentName}')
with mlflow.start_run(run_name='${runName || 'run'}'):
    ${params ? `mlflow.log_params(${JSON.stringify(params)})` : ''}
    ${metrics ? `mlflow.log_metrics(${JSON.stringify(metrics)})` : ''}
    ${artifacts ? `for a in ${JSON.stringify(artifacts)}: mlflow.log_artifact(a)` : ''}
print('Logged to MLflow')
`;
        } else if (operation === 'list') {
          script = `import mlflow; runs = mlflow.search_runs(experiment_names=['${experimentName}']); print(runs.to_json(orient='records'))`;
        } else {
          return { success: false, error: `Operation ${operation} not implemented for MLflow` };
        }
        
        const scriptPath = path.join(context.workspaceRoot, 'mlflow_op.py');
        await fs.writeFile(scriptPath, script);
        const result = await execFileAsync('python', [scriptPath], { timeout: 60000 });
        await fs.unlink(scriptPath).catch(() => {});
        
        return { success: true, output: { stdout: result.stdout, stderr: result.stderr } };
      } else {
        return { success: false, error: `Backend ${backend} not implemented. MLflow supported.` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const hpoTool: Tool = {
  name: 'ai.hpo',
  description: 'Hyperparameter optimization with Optuna: define search space, run trials, get best params',
  schema: {
    type: 'object',
    properties: {
      studyName: { type: 'string', description: 'Study name' },
      objective: { type: 'string', description: 'Objective metric (e.g., val_loss, accuracy)' },
      direction: { type: 'string', enum: ['minimize', 'maximize'], default: 'minimize' },
      paramSpace: { type: 'object', description: 'Parameter search space' },
      nTrials: { type: 'number', default: 100 },
      sampler: { type: 'string', enum: ['tpe', 'random', 'cmaes', 'grid'], default: 'tpe' },
      pruner: { type: 'string', enum: ['median', 'hyperband', 'none'], default: 'median' },
      storage: { type: 'string', description: 'Optuna storage URL (sqlite:///study.db)' },
    },
    required: ['studyName', 'objective', 'paramSpace'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { studyName, objective, direction, paramSpace, nTrials, sampler, pruner, storage } = hpoSchema.parse(input);
      
      const paramDefs = Object.entries(paramSpace).map(([name, p]) => {
        if (p.type === 'float') return `trial.suggest_float('${name}', ${p.low}, ${p.high}${p.log ? ', log=True' : ''})`;
        if (p.type === 'int') return `trial.suggest_int('${name}', ${p.low}, ${p.high}${p.log ? ', log=True' : ''})`;
        if (p.type === 'categorical') return `trial.suggest_categorical('${name}', ${JSON.stringify(p.choices)})`;
        return '';
      }).join('\n        ');
      
      const script = `
import optuna
import json

storage = '${storage || "sqlite:///" + context.workspaceRoot + "/" + studyName + ".db"}'
study = optuna.create_study(
    study_name='${studyName}',
    storage=storage,
    direction='${direction}',
    sampler=optuna.samplers.${sampler.charAt(0).toUpperCase() + sampler.slice(1)}Sampler(),
    pruner=optuna.pruners.${pruner.charAt(0).toUpperCase() + pruner.slice(1)}Pruner() if '${pruner}' != 'none' else optuna.pruners.NopPruner(),
    load_if_exists=True,
)

def objective(trial):
    ${paramDefs}
    
    # User should implement their objective function here
    # This is a placeholder - replace with actual training/evaluation
    import subprocess
    result = subprocess.run(['python', 'train.py', '--params', json.dumps(params)], capture_output=True, text=True)
    # Parse result to extract metric
    return 0.0  # Placeholder

study.optimize(objective, n_trials=${nTrials})

print('Best trial:')
best = study.best_trial
print(f'  Value: {best.value}')
print(f'  Params: {best.params}')

with open('${context.workspaceRoot}/${studyName}_best_params.json', 'w') as f:
    json.dump(best.params, f, indent=2)
`;
      
      const scriptPath = path.join(context.workspaceRoot, 'hpo_study.py');
      await fs.writeFile(scriptPath, script);
      const result = await execFileAsync('python', [scriptPath], { timeout: 86400000 });
      await fs.unlink(scriptPath).catch(() => {});
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const aiTools = [
  modelTrainTool,
  modelInferenceTool,
  modelExportTool,
  modelBenchmarkTool,
  dataProcessTool,
  experimentTrackTool,
  hpoTool,
];