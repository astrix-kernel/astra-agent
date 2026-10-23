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

const kernelCompileSchema = z.object({
  sourcePath: z.string().min(1).describe('Path to kernel module source file'),
  kernelHeaders: z.string().optional().describe('Path to kernel headers (default: /lib/modules/$(uname -r)/build)'),
  extraFlags: z.array(z.string()).optional().describe('Extra compiler flags'),
});

const kernelTraceSchema = z.object({
  program: z.string().min(1).describe('eBPF program or bpftrace script'),
  duration: z.number().int().positive().max(60).default(10).describe('Trace duration in seconds'),
  pid: z.number().int().positive().optional().describe('Target PID to trace'),
});

const shaderCompileSchema = z.object({
  sourcePath: z.string().min(1).describe('Path to shader source file (GLSL, HLSL, WGSL, SPIR-V)'),
  target: z.enum(['glsl', 'hlsl', 'wgsl', 'spirv', 'msl']).describe('Target shader language/format'),
  stage: z.enum(['vertex', 'fragment', 'compute', 'geometry', 'tessellation']).describe('Shader stage'),
  entryPoint: z.string().default('main').describe('Entry point function name'),
  defines: z.record(z.string()).optional().describe('Preprocessor defines'),
});

const assetProcessSchema = z.object({
  inputPath: z.string().min(1).describe('Input asset file path'),
  outputPath: z.string().min(1).describe('Output asset file path'),
  operation: z.enum(['compress', 'convert', 'atlas', 'optimize', 'generate-mips']).describe('Processing operation'),
  options: z.record(z.unknown()).optional().describe('Operation-specific options'),
});

const profileSchema = z.object({
  command: z.string().min(1).describe('Command to profile'),
  args: z.array(z.string()).default([]),
  duration: z.number().int().positive().max(300).default(30).describe('Profile duration in seconds'),
  outputFormat: z.enum(['json', 'text', 'flamegraph']).default('json').describe('Output format'),
});

const ecsSchema = z.object({
  operation: z.enum(['query', 'archetype', 'memory-layout', 'system-order']).describe('ECS analysis operation'),
  worldDescription: z.string().describe('Description of ECS world: components, entities, systems'),
  query: z.string().optional().describe('Component query for query operation'),
});

const kernelBuildSchema = z.object({
  operation: z.enum(['configure', 'build', 'install', 'cross-compile', 'initramfs', 'defconfig', 'menuconfig', 'savedefconfig']).describe('Kernel build operation'),
  kernelSource: z.string().min(1).describe('Path to kernel source tree'),
  arch: z.string().optional().describe('Target architecture (e.g., arm64, x86_64, riscv64)'),
  crossCompile: z.string().optional().describe('Cross-compiler prefix (e.g., aarch64-linux-gnu-)'),
  config: z.string().optional().describe('Configuration file or defconfig name'),
  outputDir: z.string().optional().describe('Output directory for build artifacts'),
  jobs: z.number().int().positive().default(4).describe('Parallel build jobs'),
  installPath: z.string().optional().describe('Install path for modules/firmware'),
  initramfsTool: z.enum(['dracut', 'mkinitcpio', 'update-initramfs']).optional().describe('Initramfs generation tool'),
});

const kernelConfigSchema = z.object({
  kernelSource: z.string().min(1).describe('Path to kernel source tree'),
  configOptions: z.record(z.string()).describe('Config options to set (e.g., {"CONFIG_DEBUG_INFO": "y"})'),
  operation: z.enum(['set', 'unset', 'enable-module', 'disable-module']).describe('Config operation'),
});

export const kernelBuildTool: Tool = {
  name: 'kernel.build',
  description: 'Build custom kernels from scratch: configure, compile, cross-compile, generate initramfs',
  schema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['configure', 'build', 'install', 'cross-compile', 'initramfs', 'defconfig', 'menuconfig', 'savedefconfig'] },
      kernelSource: { type: 'string', description: 'Path to kernel source tree' },
      arch: { type: 'string', description: 'Target architecture (arm64, x86_64, riscv64, etc.)' },
      crossCompile: { type: 'string', description: 'Cross-compiler prefix (e.g., aarch64-linux-gnu-)' },
      config: { type: 'string', description: 'Configuration file or defconfig name' },
      outputDir: { type: 'string', description: 'Output directory for build artifacts' },
      jobs: { type: 'number', description: 'Parallel build jobs', default: 4 },
      installPath: { type: 'string', description: 'Install path for modules/firmware' },
      initramfsTool: { type: 'string', enum: ['dracut', 'mkinitcpio', 'update-initramfs'] },
    },
    required: ['operation', 'kernelSource'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { operation, kernelSource, arch, crossCompile, config, outputDir, jobs, installPath, initramfsTool } = kernelBuildSchema.parse(input);
      const fullSource = safePath(kernelSource, context.workspaceRoot);
      const outDir = outputDir ? safePath(outputDir, context.workspaceRoot) : fullSource;
      
      await fs.mkdir(outDir, { recursive: true });
      
      const env: Record<string, string> = { ...process.env } as Record<string, string>;
      if (arch) env['ARCH'] = arch;
      if (crossCompile) env['CROSS_COMPILE'] = crossCompile;
      env['O'] = outDir;
      
      let result!: { stdout: string; stderr: string };
      let cmd = 'make';
      let args: string[] = [];
      
      switch (operation) {
        case 'defconfig': {
          const defconfig = config || 'defconfig';
          args = [defconfig];
          break;
        }
        case 'menuconfig': {
          args = ['menuconfig'];
          break;
        }
        case 'savedefconfig': {
          args = ['savedefconfig'];
          break;
        }
        case 'configure': {
          if (config) {
            await fs.cp(safePath(config, context.workspaceRoot), path.join(outDir, '.config'));
          } else {
            args = ['defconfig'];
          }
          break;
        }
        case 'build': {
          args = ['-j', String(jobs)];
          break;
        }
        case 'cross-compile': {
          if (!arch || !crossCompile) {
            return { success: false, error: 'arch and crossCompile required for cross-compile' };
          }
          args = ['-j', String(jobs)];
          break;
        }
        case 'install': {
          const installModPath = installPath || path.join(outDir, 'install');
          env['INSTALL_MOD_PATH'] = installModPath;
          env['INSTALL_FW_PATH'] = path.join(installModPath, 'lib/firmware');
          args = ['modules_install', 'install'];
          break;
        }
        case 'initramfs': {
          const tool = initramfsTool || 'dracut';
          const kernelVersion = await getKernelVersion(outDir);
          if (!kernelVersion) {
            return { success: false, error: 'Could not determine kernel version' };
          }
          if (tool === 'dracut') {
            result = await execFileAsync('dracut', ['--force', '--kver', kernelVersion, path.join(outDir, `initramfs-${kernelVersion}.img`)], { env, timeout: 120000 });
          } else if (tool === 'mkinitcpio') {
            result = await execFileAsync('mkinitcpio', ['-k', kernelVersion, '-g', path.join(outDir, `initramfs-${kernelVersion}.img`)], { env, timeout: 120000 });
          } else if (tool === 'update-initramfs') {
            result = await execFileAsync('update-initramfs', ['-c', '-k', kernelVersion], { env, timeout: 120000 });
          }
          return { success: true, output: { stdout: result.stdout, stderr: result.stderr, initramfs: path.join(outDir, `initramfs-${kernelVersion}.img`) } };
        }
        default:
          return { success: false, error: `Unknown operation: ${operation}` };
      }
      
      if (args.length > 0) {
        result = await execFileAsync(cmd, args, { cwd: fullSource, env, timeout: 600000, maxBuffer: 100_000_000 });
      }
      
      return { success: true, output: { stdout: result?.stdout || '', stderr: result?.stderr || '', outputDir: outDir } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

async function getKernelVersion(outDir: string): Promise<string | null> {
  try {
    const versionPath = path.join(outDir, 'include/config/kernel.release');
    const version = await fs.readFile(versionPath, 'utf8');
    return version.trim();
  } catch {
    return null;
  }
}

export const kernelConfigTool: Tool = {
  name: 'kernel.config',
  description: 'Manipulate kernel configuration (Kconfig): set/unset options, enable/disable modules',
  schema: {
    type: 'object',
    properties: {
      kernelSource: { type: 'string', description: 'Path to kernel source tree' },
      configOptions: { type: 'object', description: 'Config options to set' },
      operation: { type: 'string', enum: ['set', 'unset', 'enable-module', 'disable-module'] },
    },
    required: ['kernelSource', 'configOptions', 'operation'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { kernelSource, configOptions, operation } = kernelConfigSchema.parse(input);
      const fullSource = safePath(kernelSource, context.workspaceRoot);
      const configPath = path.join(fullSource, '.config');
      
      let configContent = await fs.readFile(configPath, 'utf8').catch(() => '');
      
      for (const [key, value] of Object.entries(configOptions)) {
        if (operation === 'set' || operation === 'enable-module') {
          const regex = new RegExp(`^#?\\s*${key}\\s*[=]?.*$`, 'm');
          const newLine = value === 'm' || value === 'y' ? `${key}=${value}` : `${key}=${value}`;
          if (regex.test(configContent)) {
            configContent = configContent.replace(regex, newLine);
          } else {
            configContent += `\n${newLine}\n`;
          }
        } else if (operation === 'unset' || operation === 'disable-module') {
          const regex = new RegExp(`^${key}\\s*[=].*$`, 'm');
          configContent = configContent.replace(regex, `# ${key} is not set`);
        }
      }
      
      await fs.writeFile(configPath, configContent);
      
      return { success: true, output: { configPath, changes: Object.keys(configOptions).length } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const kernelCompileTool: Tool = {
  name: 'kernel.compile',
  description: 'Compile a Linux kernel module',
  schema: {
    type: 'object',
    properties: {
      sourcePath: { type: 'string', description: 'Path to kernel module source file' },
      kernelHeaders: { type: 'string', description: 'Path to kernel headers' },
      extraFlags: { type: 'array', items: { type: 'string' }, description: 'Extra compiler flags' },
    },
    required: ['sourcePath'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { sourcePath, kernelHeaders } = kernelCompileSchema.parse(input);
      const fullPath = safePath(sourcePath, context.workspaceRoot);
      
      const kHeaders = kernelHeaders || `/lib/modules/$(uname -r)/build`;
      const makefilePath = path.join(path.dirname(fullPath), 'Makefile');
      
      let makefileContent = await fs.readFile(makefilePath, 'utf8').catch(() => '');
      if (!makefileContent.includes('obj-m')) {
        const moduleName = path.basename(fullPath, '.c');
        makefileContent = `obj-m += ${moduleName}.o\n\nKDIR ?= ${kHeaders}\n\nall:\n\tmake -C $(KDIR) M=$(PWD) modules\n\nclean:\n\tmake -C $(KDIR) M=$(PWD) clean\n`;
        await fs.writeFile(makefilePath, makefileContent);
      }
      
      const result = await execFileAsync('make', ['-C', path.dirname(fullPath)], { 
        timeout: 60000,
        maxBuffer: 10_000_000,
      });
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, modulePath: path.dirname(fullPath) } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const kernelTraceTool: Tool = {
  name: 'kernel.trace',
  description: 'Run eBPF/bpftrace program for kernel tracing',
  schema: {
    type: 'object',
    properties: {
      program: { type: 'string', description: 'eBPF program or bpftrace script' },
      duration: { type: 'number', description: 'Trace duration in seconds', default: 10 },
      pid: { type: 'number', description: 'Target PID to trace' },
    },
    required: ['program'],
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { program, duration, pid } = kernelTraceSchema.parse(input);
      
      const args = ['-e', program];
      if (pid) args.push('-p', String(pid));
      args.push('-d', String(duration));
      
      const result = await execFileAsync('bpftrace', args, { 
        timeout: (duration + 5) * 1000,
        maxBuffer: 10_000_000,
      });
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'bpftrace not installed. Install with: apt install bpftrace' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const shaderCompileTool: Tool = {
  name: 'shader.compile',
  description: 'Compile/validate shaders using glslangValidator or dxc',
  schema: {
    type: 'object',
    properties: {
      sourcePath: { type: 'string', description: 'Path to shader source file' },
      target: { type: 'string', enum: ['glsl', 'hlsl', 'wgsl', 'spirv', 'msl'] },
      stage: { type: 'string', enum: ['vertex', 'fragment', 'compute', 'geometry', 'tessellation'] },
      entryPoint: { type: 'string', default: 'main' },
      defines: { type: 'object', description: 'Preprocessor defines' },
    },
    required: ['sourcePath', 'target', 'stage'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { sourcePath, target, stage, defines } = shaderCompileSchema.parse(input);
      const fullPath = safePath(sourcePath, context.workspaceRoot);
      
      const stageFlag = stage.charAt(0).toUpperCase() + stage.slice(1);
      const compiler = 'glslangValidator';
      const args = ['-V', '-S', stageFlag.toLowerCase(), '-o', '/dev/stdout', fullPath];
      
      if (target === 'spirv') {
        args.push('--target-env', 'vulkan1.2');
      }
      
      if (defines) {
        for (const [key, value] of Object.entries(defines)) {
          args.push('-D', `${key}=${value}`);
        }
      }
      
      const result = await execFileAsync(compiler, args, { 
        timeout: 30000,
        maxBuffer: 10_000_000,
      });
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, spirv: result.stdout } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'glslangValidator not installed. Install Vulkan SDK or: apt install glslang-tools' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const assetProcessTool: Tool = {
  name: 'asset.process',
  description: 'Process game assets (textures, models, audio)',
  schema: {
    type: 'object',
    properties: {
      inputPath: { type: 'string', description: 'Input asset file path' },
      outputPath: { type: 'string', description: 'Output asset file path' },
      operation: { type: 'string', enum: ['compress', 'convert', 'atlas', 'optimize', 'generate-mips'] },
      options: { type: 'object', description: 'Operation-specific options' },
    },
    required: ['inputPath', 'outputPath', 'operation'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { inputPath, outputPath, operation, options } = assetProcessSchema.parse(input);
      const fullInput = safePath(inputPath, context.workspaceRoot);
      const fullOutput = safePath(outputPath, context.workspaceRoot);
      
      await fs.mkdir(path.dirname(fullOutput), { recursive: true });
      
      let result;
      switch (operation) {
        case 'compress': {
          const quality = (options?.['quality'] as number) || 80;
          result = await execFileAsync('magick', [fullInput, '-quality', String(quality), fullOutput], { timeout: 60000 });
          break;
        }
        case 'convert': {
          (options?.['format'] as string) || 'png';
          result = await execFileAsync('magick', [fullInput, fullOutput], { timeout: 60000 });
          break;
        }
        case 'generate-mips': {
          result = await execFileAsync('magick', [fullInput, '-define', 'texture:mipmap=auto', fullOutput], { timeout: 60000 });
          break;
        }
        case 'optimize': {
          result = await execFileAsync('magick', [fullInput, '-strip', '-interlace', 'Plane', fullOutput], { timeout: 60000 });
          break;
        }
        case 'atlas': {
          return { success: false, error: 'Texture atlas generation requires external tool (e.g., TexturePacker). Not implemented.' };
        }
        default:
          return { success: false, error: `Unknown operation: ${operation}` };
      }
      
      return { success: true, output: { stdout: result.stdout, stderr: result.stderr, outputPath } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'ImageMagick not installed. Install with: apt install imagemagick' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const profileTool: Tool = {
  name: 'profile.run',
  description: 'Run performance profiling on a command',
  schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to profile' },
      args: { type: 'array', items: { type: 'string' }, default: [] },
      duration: { type: 'number', description: 'Profile duration in seconds', default: 30 },
      outputFormat: { type: 'string', enum: ['json', 'text', 'flamegraph'], default: 'json' },
    },
    required: ['command'],
  },
  async execute(input, context): Promise<ToolResult> {
    try {
      const { command, args, duration, outputFormat } = profileSchema.parse(input);
      
      const profiler = 'perf';
      const profilerArgs = ['record', '-g', '-o', 'perf.data', '--', command, ...args];
      
      await execFileAsync(profiler, profilerArgs, { 
        cwd: context.workspaceRoot,
        timeout: (duration + 10) * 1000,
        maxBuffer: 50_000_000,
      });
      
      let report;
      if (outputFormat === 'json') {
        const reportResult = await execFileAsync('perf', ['script', '-i', 'perf.data', '--header'], { 
          cwd: context.workspaceRoot,
          timeout: 30000,
          maxBuffer: 50_000_000,
        });
        report = reportResult.stdout;
      } else if (outputFormat === 'flamegraph') {
        const scriptResult = await execFileAsync('perf', ['script', '-i', 'perf.data'], { 
          cwd: context.workspaceRoot,
          timeout: 30000,
          maxBuffer: 50_000_000,
        });
        report = scriptResult.stdout;
      } else {
        const reportResult = await execFileAsync('perf', ['report', '-i', 'perf.data', '--stdio'], { 
          cwd: context.workspaceRoot,
          timeout: 30000,
          maxBuffer: 50_000_000,
        });
        report = reportResult.stdout;
      }
      
      return { success: true, output: { report, format: outputFormat } };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, error: 'perf not installed. Install with: apt install linux-tools-common linux-tools-generic' };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const ecsAnalyzeTool: Tool = {
  name: 'ecs.analyze',
  description: 'Analyze ECS architecture: queries, archetypes, memory layout, system order',
  schema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['query', 'archetype', 'memory-layout', 'system-order'] },
      worldDescription: { type: 'string', description: 'Description of ECS world' },
      query: { type: 'string', description: 'Component query for query operation' },
    },
    required: ['operation', 'worldDescription'],
  },
  async execute(input, _context): Promise<ToolResult> {
    try {
      const { operation, worldDescription, query } = ecsSchema.parse(input);
      
      let result;
      switch (operation) {
        case 'query': {
          result = `ECS Query Analysis for: ${query || 'all entities'}\nWorld: ${worldDescription}\n\nQuery: ${query || 'N/A'}\nEstimated matching archetypes: Analyze component combinations.\nOptimization: Consider component storage (SoA vs AoS), cache line alignment.`;
          break;
        }
        case 'archetype': {
          result = `Archetype Analysis:\nWorld: ${worldDescription}\n\nArchetypes are unique combinations of components.\nEach archetype stores entities in contiguous arrays (SoA).\nFragmentation occurs when entities frequently add/remove components.\nOptimization: Pre-allocate archetypes, use component tags for filtering.`;
          break;
        }
        case 'memory-layout': {
          result = `Memory Layout Analysis:\nWorld: ${worldDescription}\n\nData-oriented design principles:\n- Structure of Arrays (SoA) for cache efficiency\n- Align component data to cache lines (64 bytes)\n- Group frequently accessed components together\n- Use archetype-based storage for iteration performance\n- Consider padding for SIMD alignment`;
          break;
        }
        case 'system-order': {
          result = `System Order Analysis:\nWorld: ${worldDescription}\n\nSystem execution order:\n1. Input/Event systems (read-only)\n2. Simulation systems (read-write)\n3. Physics/Constraint solving\n4. Animation/Transform updates\n5. Render preparation\n6. Render submission\n\nDependencies: Write-before-read, read-after-write.\nParallelize: Systems with disjoint component access.`;
          break;
        }
      }
      
      return { success: true, output: { result, operation, worldDescription, query } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const systemsTools = [
  kernelCompileTool,
  kernelTraceTool,
  kernelBuildTool,
  kernelConfigTool,
  shaderCompileTool,
  assetProcessTool,
  profileTool,
  ecsAnalyzeTool,
];