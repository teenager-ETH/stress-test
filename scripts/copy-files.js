console.log("Copy declaration files to dist in zkopru");
const fs = require("fs");
const path = require("path");

const TargetPackages = ["babyjubjub", "contracts"]

// 1. Get All un-copied declaration files
let checkDirectories = new Set()

const getAllDeclarationFiles = function(dirPath, allFiles) {
  if (dirPath.endsWith('/dist') || dirPath.endsWith('/node_modules')) return allFiles

  files = fs.readdirSync(dirPath)

  allFiles = allFiles || {}

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      allFiles = getAllDeclarationFiles(dirPath + "/" + file, allFiles)
    } else if (file.endsWith(".d.ts") ) {
      if (allFiles[dirPath] == undefined) allFiles[dirPath] = []
      allFiles[dirPath].push(file)
      checkDirectories.add(dirPath.replace('/src', '/dist'))
    }
  })

  return allFiles
}

let unCopiedFiles = {}

TargetPackages.forEach(package => {
  const targetFiles = getAllDeclarationFiles(`./zkopru/packages/${package}`)
  const filePath = Object.keys(targetFiles)
  unCopiedFiles[filePath] = targetFiles[filePath]
})

// 2. Check folder exist or create it
for (targetDirectory of checkDirectories) {
  if (!fs.existsSync(targetDirectory)) {
    fs.mkdirSync(targetDirectory)
  }
  // 3. Copy files from source to destination even if exist, overwrite
  const sourceDirectory = targetDirectory.replace('/dist', '/src')
  unCopiedFiles[sourceDirectory].forEach(file => {
    fs.copyFileSync(path.join(sourceDirectory, file), path.join(targetDirectory, file))
  })
}
const copiedFiles = Object.keys(unCopiedFiles).reduce((total, path) => total + unCopiedFiles[path].length, 0)
console.log(`${copiedFiles} files are copied`)
