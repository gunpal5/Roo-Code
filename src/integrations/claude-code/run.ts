import * as vscode from "vscode"
import Anthropic from "@anthropic-ai/sdk"
import { execa } from "execa"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

/**
 * Converts a Windows path to a WSL-compatible path
 * @param windowsPath The Windows path to convert
 * @returns The WSL-compatible path
 */
function convertWindowsPathToWsl(windowsPath: string): string {
	// Remove drive letter and convert backslashes to forward slashes
	const driveLetter = windowsPath.charAt(0).toLowerCase()
	const pathWithoutDrive = windowsPath.substring(2).replace(/\\/g, "/")
	return `/mnt/${driveLetter}${pathWithoutDrive}`
}

/**
 * Creates temporary files for Claude CLI input and returns their paths
 * @param cwd The current working directory
 * @param messages The messages to write to a file
 * @param systemPrompt The system prompt to write to a file
 * @returns Object containing paths to the temporary files and a cleanup function
 */
function createTemporaryFiles(
	cwd: string | undefined,
	messages: Anthropic.Messages.MessageParam[],
	systemPrompt: string,
) {
	// Create temp directory in workspace or fallback to system temp
	const tempDirPath = cwd ? path.join(cwd, ".claude-code-temp") : path.join(os.tmpdir(), ".claude-code-temp")

	// Create the directory if it doesn't exist
	if (!fs.existsSync(tempDirPath)) {
		fs.mkdirSync(tempDirPath, { recursive: true })
	}

	// Create unique filenames
	const timestamp = Date.now()
	const messagesFilePath = path.join(tempDirPath, `messages-${timestamp}.json`)
	const systemPromptFilePath = path.join(tempDirPath, `system-prompt-${timestamp}.txt`)

	// Write the files
	fs.writeFileSync(messagesFilePath, JSON.stringify(messages), "utf8")
	fs.writeFileSync(systemPromptFilePath, systemPrompt, "utf8")

	// Return paths and cleanup function
	return {
		messagesFilePath,
		systemPromptFilePath,
		cleanup: () => {
			try {
				fs.unlinkSync(messagesFilePath)
				fs.unlinkSync(systemPromptFilePath)

				// Try to remove the directory if it's empty
				const files = fs.readdirSync(tempDirPath)
				if (files.length === 0) {
					fs.rmdirSync(tempDirPath)
				}
			} catch (error) {
				console.error("Error cleaning up temporary Claude CLI files:", error)
			}
		},
	}
}

/**
 * Runs Claude CLI on Windows using WSL
 * @param params Parameters for running Claude CLI
 * @returns Execa process
 */
function runClaudeCodeOnWindows({
	systemPrompt,
	messages,
	claudePath,
	modelId,
	cwd,
}: {
	systemPrompt: string
	messages: Anthropic.Messages.MessageParam[]
	claudePath: string
	modelId?: string
	cwd?: string
}) {
	// Create temporary files for messages and system prompt
	const tempFiles = createTemporaryFiles(cwd, messages, systemPrompt)

	// Convert Windows paths to WSL paths
	const wslMessagesPath = convertWindowsPathToWsl(tempFiles.messagesFilePath)
	const wslSystemPromptPath = convertWindowsPathToWsl(tempFiles.systemPromptFilePath)

	// Modify args to use file paths instead of raw JSON
	const fileArgs = [
		"-p",
		`@${wslMessagesPath}`,
		"--system-prompt",
		`@${wslSystemPromptPath}`,
		"--verbose",
		"--output-format",
		"stream-json",
		"--max-turns",
		"1",
		"--disallowedTools",
		"Task Bash Glob Grep LS exit_plan_mode Read Edit MultiEdit Write NotebookRead NotebookEdit WebFetch TodoRead TodoWrite WebSearch",
	]

	if (modelId) {
		fileArgs.push("--model", modelId)
	}

	let l = fileArgs.join(" ")
	// Create the process
	const childProcess = execa("wsl", [claudePath, ...fileArgs], {
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
		cwd: cwd,
	})

	// Clean up temporary files when the process exits
	childProcess.finally(() => {
		tempFiles.cleanup()
	})

	return childProcess
}

/**
 * Runs Claude CLI on non-Windows platforms
 * @param params Parameters for running Claude CLI
 * @returns Execa process
 */
function runClaudeCodeOnNonWindows({
	systemPrompt,
	messages,
	claudePath,
	modelId,
	cwd,
}: {
	systemPrompt: string
	messages: Anthropic.Messages.MessageParam[]
	claudePath: string
	modelId?: string
	cwd?: string
}) {
	// Create args for Claude CLI
	const args = [
		"-p",
		JSON.stringify(messages),
		"--system-prompt",
		systemPrompt,
		"--verbose",
		"--output-format",
		"stream-json",
		"--max-turns",
		"1",
	]

	if (modelId) {
		args.push("--model", modelId)
	}

	// Run Claude CLI directly
	return execa(claudePath, args, {
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
		cwd,
	})
}

export function runClaudeCode({
	systemPrompt,
	messages,
	path,
	modelId,
}: {
	systemPrompt: string
	messages: Anthropic.Messages.MessageParam[]
	path?: string
	modelId?: string
}) {
	const claudePath = path || "claude"
	const isWindows = process.platform === "win32"
	const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)

	// TODO: Is it worth using sessions? Where do we store the session ID?

	// Dispatch to the appropriate platform-specific method
	if (isWindows) {
		return runClaudeCodeOnWindows({
			systemPrompt,
			messages,
			claudePath,
			modelId,
			cwd,
		})
	} else {
		return runClaudeCodeOnNonWindows({
			systemPrompt,
			messages,
			claudePath,
			modelId,
			cwd,
		})
	}
}
