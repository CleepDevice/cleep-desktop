@echo off
:: params:
::  %1: drive path
::  %2: image filepath
etcher-cli\etcher.exe --yes --drive %1 %2
