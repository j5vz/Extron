![Proof-of-concept working exploit](https://github.com/Vector4-new/ecsr-web-executor/blob/5de6c24d4870b63e8a6219cb85db1ef1511d9bfe/poc.png?raw=true)

# **!!! UNFINISHED !!!**
Extron is based off another open-source executor. Go check them out, as the repository is an direct fork. I'm working on making it undetected, meanhile the forked executor is detected & discontinued.  

## Loading
Turn on developer mode.  
Select "Load unpacked," and select the folder.  
Make sure the extension is turned on.  
When you join a game, just open the extension window from the extensions list and run your code.  

## Updating
This was and is a fucking nightmare to work on. (for me too))
Good luck.  
No exceptions.  
No function names.  
No strings.  
Somewhat. All strings are stored starting at address 0 until some point (maybe like 300,000 bytes in).  
If you know what you are doing, you can dump them, then look at the bytecode.  
No strings in the bytecode; you have to search for the address of the string.  
