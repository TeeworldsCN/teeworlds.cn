const HtmlPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const path = require('path');

module.exports = (env, argv) => {
  const devMode = argv.mode !== 'production';

  return {
    entry: './src/index.ts',
    devtool: devMode ? 'inline-source-map' : undefined,
    mode: devMode ? 'development' : 'production',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.(sa|sc|c)ss$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
        },
        {
          test: /\.(jpg|jpeg|png|woff|woff2|eot|ttf|svg)$/,
          use: ['file-loader'],
          exclude: /static/,
        },
      ],
    },
    optimization: {
      usedExports: true,
      sideEffects: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, 'src/components/'),
        'styles': path.resolve(__dirname, 'src/styles/'),
      },
    },
    output: {
      filename: '[name].[chunkhash].js',
      path: path.resolve(__dirname, 'dist'),
    },
    plugins: [
      new CleanWebpackPlugin({
        dry: devMode,
      }),
      new HtmlPlugin({
        title: 'Teeworlds中文社区',
        meta: {
          viewport: 'width=device-width, initial-scale=1, shrink-to-fit=no, user-scalable=0',
        },
      }),
      new MiniCssExtractPlugin({
        filename: '[name].[contenthash].css',
        chunkFilename: '[name].[contenthash].css',
      }),
      new webpack.DefinePlugin({
        __DEV: JSON.stringify(devMode),
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'static',
            to: 'static',
          },
        ],
      }),
    ],
  };
};
