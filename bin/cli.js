#!/usr/bin/env node

/**
 * CLI entry
 */

var program = require('commander');
var version = require('../package.json').version;
var frontCustos = require('../');

var fs = require('fs');
var path = require('path');

program
    .version(version)
    .arguments('<projDir> [taskMode]')
    .option('-i, --ignore', "Ignore the tasks configured in package.json. (Works with --append-tasks)")
    .option('-a, --append-tasks <taskName>', "Append extra task names, one at a time, repeatable.", function (val, memo) {
        memo.push(val);
        return memo;
    }, [])
    .option('-o, --output-dir <outputDir>', "Set path of output directory.")
    .action(function (projDir, taskMode = '__default', options) {
        var appendTasks = options.appendTasks || [],
            outputDir = options.outputDir || null;

        projDir = path.resolve(projDir);

        console.log('Processing:', projDir, '[' + taskMode + ']');
        // process.exit();

        if (!fs.existsSync(projDir)) {
            console.error('Directory of project does not exists!');
            return;
        }

        if (!fs.statSync(projDir).isDirectory()) {
            console.error('Path of project is not directory!');
            return;
        }

        if (!outputDir) {
            outputDir = '../' + path.basename(projDir) + '_dist';
        }

        var packagePath = path.resolve(projDir, 'package.json');

        if (!fs.existsSync(projDir)) {
            console.error('No "package.json" file in project directory!');
            return;
        }

        var packageJson = fs.readFileSync(packagePath).toString(),
            packageOptions = JSON.parse(packageJson),
            fcOptions = packageOptions.fcOpts[taskMode];

        fcOptions['proj'] = {
            projDir,
            projName: packageOptions.name,
            version: packageOptions.version,
            env: taskMode === '__default' ? '默认' : taskMode,
            mode: taskMode,
        };


        if (!fcOptions) {
            console.error(`No "fcOpts" filed for mod "${taskMode}" in "package.json" of project!`);
            return;
        }

        frontCustos.setConfig({
            outputDir: outputDir,
            htmlEnhanced: false,
            flattenMap: {
                page: '',
                style: 'css',
                script: 'js',
                image: 'images',
                font: 'font',
                audio: 'audio',
                other: 'raw'
            },
            delUnusedFiles: true,
            concurrentLimit: 1
        });

        var tasks = program.ignore ? [] : fcOptions['tasks'];
        fcOptions['tasks'] = tasks.concat(appendTasks);

        frontCustos.process(fcOptions);
    });

program.parse(process.argv);
