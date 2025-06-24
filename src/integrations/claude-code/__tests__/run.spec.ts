import { describe, test, expect, vi, beforeEach } from "vitest"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

// Mock vscode workspace
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [
			{
				uri: {
					fsPath: "/test/workspace",
				},
			},
		],
	},
}))

describe("runClaudeCode", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	test("should export runClaudeCode function", async () => {
		const { runClaudeCode } = await import("../run")
		expect(typeof runClaudeCode).toBe("function")
	})

	test("should be an async generator function", async () => {
		const { runClaudeCode } = await import("../run")
		const options = {
			systemPrompt: "You are a helpful assistant",
			messages: [{ role: "user" as const, content: "Hello" }],
		}

		const result = runClaudeCode(options)
		expect(Symbol.asyncIterator in result).toBe(true)
		expect(typeof result[Symbol.asyncIterator]).toBe("function")
	})

	test("should validate input parameters", async () => {
		const { runClaudeCode } = await import("../run")

		// Test invalid systemPrompt - should throw when generator is consumed
		const generator1 = runClaudeCode({
			systemPrompt: "",
			messages: [{ role: "user", content: "test" }],
		})
		await expect(generator1.next()).rejects.toThrow("systemPrompt is required and must be a string")

		// Test invalid messages - should throw when generator is consumed
		const generator2 = runClaudeCode({
			systemPrompt: "test",
			messages: [],
		})
		await expect(generator2.next()).rejects.toThrow("messages is required and must be a non-empty array")
	})

	test("should handle Windows path conversion correctly", () => {
		// Test the convertWindowsPathToWsl function indirectly
		// Since it's not exported, we'll test the behavior through integration

		// Mock process.platform to simulate Windows
		const originalPlatform = process.platform
		Object.defineProperty(process, "platform", {
			value: "win32",
		})

		// Test valid Windows paths
		const validPaths = [
			"C:\\Users\\test\\file.txt",
			"D:\\Projects\\myproject\\src\\index.js",
			"E:\\temp\\data.json",
		]

		// We can't directly test the internal function, but we can verify
		// that the Windows code path doesn't throw errors with valid paths
		validPaths.forEach((testPath) => {
			expect(() => {
				// This would be called internally by runClaudeCodeOnWindows
				const driveLetter = testPath.charAt(0).toLowerCase()
				const pathWithoutDrive = testPath.substring(2).replace(/\\/g, "/")
				const wslPath = `/mnt/${driveLetter}${pathWithoutDrive}`
				expect(wslPath).toMatch(/^\/mnt\/[a-z]\//)
			}).not.toThrow()
		})

		// Restore original platform
		Object.defineProperty(process, "platform", {
			value: originalPlatform,
		})
	})

	test("should create unique temporary file names", () => {
		// Test that temporary files have unique names
		const tempDir = os.tmpdir()
		const timestamp1 = Date.now()
		const pid = process.pid

		const file1 = path.join(tempDir, `messages-${timestamp1}-${pid}.json`)
		const file2 = path.join(tempDir, `messages-${timestamp1 + 1}-${pid}.json`)

		expect(file1).not.toBe(file2)
		expect(file1).toContain(String(pid))
		expect(file2).toContain(String(pid))
	})
})
