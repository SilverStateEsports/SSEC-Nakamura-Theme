// Gulp requirements
const { series, src, dest } = require('gulp');
const pump = require('pump');
const zip = require('gulp-zip');
// TODO: Add tasks for Gulp

// Clean function removes distribution files
function clean(cb) {

}

// Zip function zips up the enitre directory and allows us to distribute it.
function zip(cb) {
    const filename = require('./package.json').name + '.zip';
    pump([
        src([
            '**',
            '!node_modules', '!node_modules/**',
            '!build', '!build/**'
        ]),
        zip(filename),
        dest('build/')
    ]);
}

function defaultTask(cb) {
    cb();
}
exports.zip = series(zip);
exports.default = defaultTask