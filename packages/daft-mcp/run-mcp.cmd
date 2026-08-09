@echo off
REM Cursor injects ELECTRON_RUN_AS_NODE into MCP child processes, which breaks
REM Bun/Node stdio MCP servers. Clear it before starting.
set ELECTRON_RUN_AS_NODE=
set ELECTRON_NO_ASAR=
cd /d "F:\aiprojects\daft.ie"
"C:\Users\lorto\.bun\bin\bun.exe" "F:\aiprojects\daft.ie\packages\daft-mcp\src\index.ts"
