@echo off
:: params:
:: %1: install path 
:: %2: drive path
:: %3: image filepath
%1\etcher-cli\etcher.exe --yes --drive %2 %3
