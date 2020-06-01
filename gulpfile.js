// Gulp requirements
const { series, parallel, src, dest } = require('gulp');
const del = require('delete');
const pump = require('pump');
const zip = require('gulp-zip');
const sass = require('gulp-sass');

// Setup variables
sass.compiler = require('node-sass');

const handleError = (done) => {
    return function (err) {
        if (err) {
            
        }
        return done(err);
    }
}

// TODO: Add tasks for Gulp

// Builds scss
function scss(cb) {
    pump([
        src('assets/scss/*.scss', {sourcemaps: true}),
        sass(),
        dest('assets/css/', {sourcemaps: '.'})
    ], handleError(cb));
}

// Clean function removes distribution files
function cleanup(cb) {
    del(['build/**/*', 'assets/css/**/*', 'build'], cb)
}

// Zip function zips up the enitre directory and allows us to distribute it.
function zipper(cb) {
    const filename = require('./package.json').name + '.zip';
    pump([
        src([
            '**',
            '!node_modules', '!node_modules/**',
            '!build', '!build/**'
        ]),
        zip(filename),
        dest('build/')
    ], handleError(cb));
}

function defaultTask(cb) {
    cb();
}

const build = parallel(scss);

exports.build = build;
exports.zip = series(build, zipper);
exports.clean = series(cleanup);
exports.default = build;