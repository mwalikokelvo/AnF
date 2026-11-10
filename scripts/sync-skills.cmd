@echo off
echo [AnF] Syncing and updating agent skills...
call npm update -g skills
call skills update -y
call skills update -g -y
echo [AnF] Agent skills and CLI are up to date.
