export interface SkillRecord {
    id: string;
    name: string;
    description: string;
    category: string;
    publisher: string;
    builtin: boolean;
    installed: boolean;
    enabled: boolean;
    instructions?: string;
    source?: string;
}
export declare function listBuiltinSkills(): SkillRecord[];
export declare function skillMetadataForPrompt(skills: SkillRecord[]): string;
export declare function parseSkillMarkdown(content: string, directoryName: string): SkillRecord;
export declare function loadSkillFromDirectory(directory: string): Promise<SkillRecord>;
//# sourceMappingURL=index.d.ts.map