// Gulp requirements
const { series, src, dest } = require('gulp');
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
    ], handleError(cb));
}

function defaultTask(cb) {
    cb();
}
exports.zip = series(zip);
exports.default = defaultTask