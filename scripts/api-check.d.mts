export declare const REPORT: string;
export declare function declarations(report: string): Map<string, string[]>;
export declare function breakingChanges(oldReport: string, newReport: string): string[];
