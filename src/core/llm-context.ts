/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

let secretStorage: vscode.SecretStorage | undefined;

export const LLM_API_KEY_SECRET = 'aiEngineerCoach.llm.apiKey';

export function initLlmContext(context: vscode.ExtensionContext): void {
  secretStorage = context.secrets;
}

export function getLlmSecretStorage(): vscode.SecretStorage | undefined {
  return secretStorage;
}
