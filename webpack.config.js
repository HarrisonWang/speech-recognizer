const path = require('path');

module.exports = {
    entry: './src/index.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'xunfei-iat.js',
        library: 'XunfeiIatRecorder',
        libraryTarget: 'umd',
        libraryExport: 'default',
        globalObject: 'this'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                },
                exclude: /node_modules/
            },
            {
                test: /\.worker\.js$/,
                use: { 
                    loader: 'worker-loader',
                    options: { 
                        inline: 'no-fallback'
                    }
                }
            }
        ]
    },
    mode: 'production'
}; 