const path = require('path')

module.exports = {
    entry: './src/main.js',
    output: {
        path: path.resolve(__dirname, 'js'),
        filename: 'iiifserver-main.js',
        publicPath: '/apps/iiifserver/js/',
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env'],
                    },
                },
            },
        ],
    },
    resolve: {
        extensions: ['.js'],
        fallback: {
            'string_decoder': false,
            'buffer': false,
            'stream': false,
            'path': false,
            'fs': false,
        },
    },
}
