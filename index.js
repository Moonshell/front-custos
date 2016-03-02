/**
 * Created by krimeshu on 2016/1/10.
 */

var _os = require('os'),
    _path = require('path'),

    gulp = null,
    runSequenceUseGulp = null,

    runSequence = require('run-sequence'),
    del = require('del'),
    cache = require('gulp-cache'),
    imagemin = require('gulp-imagemin'),
    pngquant = require('imagemin-pngquant'),

    Utils = require('./script/utils.js'),
    Timer = require('./script/timer.js'),
    ConstReplacer = require('./script/const-replacer.js'),
    FileIncluder = require('./script/file-includer.js'),
    FileLinker = require('./script/file-linker.js'),
    FileUploader = require('./script/file-uploader.js'),
    SpriteCrafterProxy = require('./script/sprite-crafter-proxy.js'),
    PrefixCrafterProxy = require('./script/prefix-crafter-proxy.js');

var config = {
        delUnusedFiles: true
    },
    params = {};

var tasks = {
    // 准备构建环境：
    // - 清理构建文件夹
    // - 复制源文件到构建文件夹
    'prepare_build': function (done) {
        var srcDir = params.srcDir,
            buildDir = params.buildDir;

        var timer = new Timer();
        console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'prepare_build 任务开始……');
        del([_path.resolve(buildDir, '**/*')], {force: true}).then(function () {
            gulp.src(_path.resolve(srcDir, '**/*'))
                .pipe(gulp.dest(buildDir))
                .on('end', function () {
                    console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'prepare_build 任务结束。（' + timer.getTime() + 'ms）');
                    done();
                });
        });
    },
    // 替换常量：
    // - 替换常见常量（项目路径、项目名字等）
    'replace_const': function (done) {
        var buildDir = params.buildDir,
            pattern = _path.resolve(buildDir, '**/*@(.js|.css|.html|.shtml|.php)'),
            constFields = params.constFields;

        var timer = new Timer();
        console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'replace_const 任务开始……');

        var replacer = new ConstReplacer(constFields);
        //replacer.doReplace(params);
        gulp.src(pattern)
            .pipe(replacer.handleFile())
            .pipe(gulp.dest(buildDir))
            .on('end', function () {
                console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'replace_const 任务结束。（' + timer.getTime() + 'ms）');
                done();
            });
    },
    // 合并文件：
    // - 根据 #include 包含关系，合并涉及到的文件
    'join_include': function (done) {
        var buildDir = params.buildDir;
        var includer = new FileIncluder(function (err) {
            console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'join_include: ', err);
        });

        var timer = new Timer();
        console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'join_include 任务开始……');
        var fileList = includer.analyseDepRelation(buildDir);
        gulp.src(fileList, {base: buildDir})
            .pipe(includer.handleFile())
            .pipe(gulp.dest(buildDir))
            .on('end', function () {
                console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'join_include 任务结束。（' + timer.getTime() + 'ms）');
                done();
            });
    },
    // 雪碧图处理：
    // - 使用 Sprite Crafter（基于 spritesmith）解析CSS，自动合并雪碧图
    'sprite_crafter': function (done) {
        var buildDir = params.buildDir,
            pattern = _path.resolve(buildDir, '**/*@(.css)'),
            scOpt = params.scOpt;

        var timer = new Timer();
        console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'sprite_crafter 任务开始……');
        var files = [],
            maps = {};
        scOpt.src = buildDir;
        gulp.src(pattern)
            .pipe(SpriteCrafterProxy.analyseUsedImageMap(files, maps))
            .pipe(gulp.dest(buildDir))
            .on('end', function () {
                scOpt.files = files;
                scOpt.maps = maps;
                SpriteCrafterProxy.process(scOpt, function () {
                    console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'sprite_crafter 任务结束。（' + timer.getTime() + 'ms）');
                    done();
                });
            });
    },
    // 前缀处理：
    // - 使用 Prefix Crafter（基于 autoprefixer）处理CSS，自动添加需要的浏览器前缀
    'prefix_crafter': function (done) {
        var buildDir = params.buildDir,
            pattern = _path.resolve(buildDir, '**/*@(.css)'),
            pcOpt = params.pcOpt;

        var timer = new Timer();
        console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'prefix_crafter 任务开始……');
        gulp.src(pattern)
            .pipe(PrefixCrafterProxy.process(pcOpt))
            .pipe(gulp.dest(buildDir))
            .on('end', function () {
                console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'prefix_crafter 任务结束。（' + timer.getTime() + 'ms）');
                done();
            });
    },
    // 分发链接：
    // - 根据文件类型分发文件到不同的目录
    // - 根据 #link 语法、CSS中 url() 匹配和 HTML 解析，自动提取并替换静态资源的链接
    'allot_link': function (done) {
        var buildDir = params.buildDir,
            alOpt = params.alOpt,

            htmlEnhanced = config.htmlEnhanced;

        alOpt.src = buildDir;

        var timer = new Timer();
        console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'allot_link 任务开始……');

        var linker = new FileLinker({
            htmlEnhanced: htmlEnhanced
        }, function (err) {
            console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'allot_link:process: ', err);
        });
        var fileAllotMap = {},                               // 用于记录文件分发前后的路径关系
            usedFiles = linker.analyseDepRelation(buildDir); //记录分发前的文件依赖表
        // 1. 将构建文件夹中的文件进行分发和重链接，生成到分发文件夹中
        gulp.src(_path.resolve(buildDir, '**/*'))
            .pipe(linker.handleFile(alOpt, fileAllotMap))
            .pipe(gulp.dest(buildDir))
            .on('end', function () {
                // 2. 更新分发后的使用文件依赖关系表
                var recycledFiles = [],
                    allotedUsedFiles = [];
                for (var oldFile in fileAllotMap) {
                    if (fileAllotMap.hasOwnProperty(oldFile)) {
                        var newFile = fileAllotMap[oldFile];
                        oldFile !== newFile && recycledFiles.push(oldFile);
                    }
                }
                usedFiles.forEach(function (filePath) {
                    filePath = fileAllotMap[filePath] || filePath;
                    allotedUsedFiles.push(filePath);
                });
                params.usedFiles = allotedUsedFiles;

                //console.log('recycledFiles:', recycledFiles);
                //console.log('allotedUsedFiles:', allotedUsedFiles);
                // 3. 清空构建文件夹的过期旧文件
                del(recycledFiles, {force: true}).then(function () {
                    console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'allot_link 任务结束。（' + timer.getTime() + 'ms）');
                    done();
                });
            });
    },
    // 优化图片：
    // - Png图片有损压缩（PngQuant）
    // - Jpg图片转为渐进式
    // - Gif图片转为隔行加载
    'optimize_image': function (done) {
        var timer = new Timer();
        console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'optimize_image 任务开始……');

        runSequenceUseGulp(['optimize_image:png', 'optimize_image:other'], function () {
            console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'optimize_image 任务结束。（' + timer.getTime() + 'ms）');
            done();
        });
    },
    'optimize_image:png': function (done) {
        var buildDir = params.buildDir;

        gulp.src(_path.resolve(buildDir, '**/*.png'))
            .pipe(cache(pngquant({
                quality: '65-80',
                speed: 4
            })(), {
                fileCache: new cache.Cache({cacheDirName: 'imagemin-cache'})
            }))
            .pipe(gulp.dest(buildDir))
            .on('end', done);
    },
    'optimize_image:other': function (done) {
        var buildDir = params.buildDir;

        gulp.src(_path.resolve(buildDir, '**/*.{jpg,gif}'))
            .pipe(cache(imagemin({
                progressive: true,
                interlaced: true
            }), {
                fileCache: new cache.Cache({cacheDirName: 'imagemin-cache'})
            }))
            .pipe(gulp.dest(buildDir))
            .on('end', done);
    },
    // 发布：
    // - 清理发布文件夹
    // - 将构建文件夹中的文件发布到发布文件夹
    'do_dist': function (done) {
        var buildDir = params.buildDir,
            distDir = params.distDir,
            usedFiles = params.usedFiles,

            htmlEnhanced = config.htmlEnhanced,
            delUnusedFiles = config.delUnusedFiles;

        var timer = new Timer();
        console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'do_dist 任务开始……');

        var linker = new FileLinker({
            htmlEnhanced: htmlEnhanced                                 // php代码处理有误，关闭 cheerio 解析
        }, function (err) {
            console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'do_dist: ', err);
        });

        //console.log('usedFiles:', usedFiles);
        if (delUnusedFiles) {
            if (!usedFiles) {
                usedFiles = params.usedFiles = linker.analyseDepRelation(buildDir);
            }
        } else {
            usedFiles = null;
        }

        del([distDir + '/**/*'], {force: true}).then(function () {
            gulp.src(buildDir + '/**/*')
                .pipe(linker.excludeUnusedFiles(usedFiles))
                .pipe(linker.excludeEmptyDir())
                .pipe(gulp.dest(distDir))
                .on('end', function () {
                    console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'do_dist 任务结束。（' + timer.getTime() + 'ms）');
                    done();
                });
        });
    },
    // 上传：
    // - 将发布文件夹中的文件发到测试服务器
    'do_upload': function (done) {
        var prjName = params.prjName,
            distDir = params.distDir,

            uploadPage = config.uploadPage,
            uploadForm = config.uploadForm;

        var uploader = new FileUploader({
            projectName: prjName,
            projectDir: distDir,
            uploadPage: uploadPage,
            uploadForm: uploadForm
        });

        var timer = new Timer();
        console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'do_upload 任务开始……');

        gulp.src(_path.resolve(distDir, '/**/*'))
            .pipe(uploader.appendFile())
            .on('end', function () {
                uploader.doUpload(function onProgress(err, filePath, response) {
                    // 完成一个文件时
                    var relativePath = _path.relative(distDir, filePath),
                        succeedCount = results.succeed.length,
                        failedCount = results.failed.length,
                        totalCount = succeedCount + failedCount;
                    console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'do_upload 任务进度：' + relativePath + ' 上传' +
                        (!err ? '成功' : '失败') + '，' + totalCount + '/' + succeedCount + '/' + failedCount);
                }, function onComplete(results) {
                    // 完成所有文件时
                    var succeedCount = results.succeed.length,
                        failedCount = results.failed.length,
                        totalCount = succeedCount + failedCount,
                        resText = '，共' + totalCount + '个文件，成功' + succeedCount + '个' +
                            (failedCount ? '，失败' + failedCount + '个' : '');
                    console.log(Utils.formatTime('[HH:mm:ss.fff]'), 'do_dist 任务结束' + resText + '（' + timer.getTime() + 'ms）');
                    done();
                });
            });
    }
};

module.exports = {
    registerTasks: function (_gulp) {
        gulp = _gulp;
        runSequenceUseGulp = runSequence.use(gulp);

        for (var taskName in tasks) {
            if (!tasks.hasOwnProperty(taskName)) {
                continue;
            }
            gulp.task(taskName, tasks[taskName]);
        }
    },
    config: function (_config) {
        config = _config;
    },
    process: function (_params, cb) {
        params = _params;

        // 提取项目名称和构建、发布文件夹路径
        params.prjName = _path.basename(params.srcDir);
        params.buildDir = _path.resolve(_os.tmpdir(), 'FC_BuildDir', params.prjName);
        params.distDir = _path.resolve('D:\\FC_Output', params.prjName);

        // 生成项目常量并替换参数中的项目常量
        var constFields = {
            PROJECT: params.buildDir,
            PROJECT_NAME: params.prjName,
            VERSION: params.version
        }, replacer = new ConstReplacer(constFields);
        replacer.doReplace(params);
        params.constFields = constFields;

        // 保留旧版副本时，生成路径中加上版本号
        if (params.keepOldCopy) {
            params.distDir = _path.resolve(params.distDir, params.version);
        }

        var timer = new Timer();
        console.log(Utils.formatTime('[HH:mm:ss.fff]'), '项目 ' + params.prjName + ' 任务开始……');

        var tasks = params.tasks || [];
        tasks.push(function () {
            console.log(Utils.formatTime('[HH:mm:ss.fff]'), '项目 ' + params.prjName + ' 任务结束。（共计' + timer.getTime() + 'ms）');
            cb && cb();
        });
        runSequenceUseGulp.apply(null, tasks);
    }
};
