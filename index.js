const fs = require('fs');
const inquirer = require('inquirer');
const chalk = require('chalk');
const figlet = require('figlet');
const gradient = require("gradient-string");
const cliProgress = require('cli-progress');
const colors = require('ansi-colors');
const Jimp = require("jimp");
const { createSpinner } = require('nanospinner');
const heicConvert = require('heic-convert');
const jpeg = require('jpeg-js');
const yargs = require('yargs');

Jimp.decoders['image/jpeg'] = (data) => jpeg.decode(data, { maxMemoryUsageInMB: 4096 });

const argv = yargs
  .option('input', { alias: 'i', describe: 'Input folder with images', type: 'string' })
  .option('output', { alias: 'o', describe: 'Output folder for watermarked images', type: 'string' })
  .option('watermark', { alias: 'w', describe: 'Watermark image (PNG)', type: 'string' })
  .help()
  .argv;

let globalConfig = {
  input: argv.input || 'images/',
  output: argv.output || 'output/',
  watermark: argv.watermark || 'watermark.png',
  location: 'bottom-right',
  opacity: 0.7
};

async function splashScreen() {
  console.clear();
  console.log(chalk.white.bold('-[--------------------------------------------------------------------------------]-'));
  figlet(
    'Watermarker',
    {
      align: "center",
    },
    (err, data) => {
      console.log(gradient.pastel.multiline(data));
      console.log(chalk.white.bold('-[--------------------------------------------------------------------------------]-'));
      mainMenu();
    }
  );
}

function mainMenu() {
  inquirer
    .prompt([
      {
        type: 'list',
        name: 'location',
        message: 'Select watermark location:',
        choices: ['Bottom right', 'Bottom left', 'Top right', 'Top left']
      },
    ])
    .then((answers) => {
      globalConfig.location = answers.location;
      readImageFiles('images/');
    })
    .catch((error) => {
      console.error(chalk.red('Error occurred: ', error));
    });
}

function readImageFiles(dirname) {
  const spinner = createSpinner('Finding images...').start();
  let imageList = [];
  let heicList = [];

  fs.readdir(dirname, function (err, filenames) {
    if (err) {
      spinner.error({ text: 'Error occurred while reading files' });
      process.exit(1);
    }
    filenames.forEach(function (filename) {
      let image = filename.toLowerCase();
      if (image.endsWith('.png') || image.endsWith('.jpg') || image.endsWith('.jpeg')) {
        imageList.push(image);
      } else if (image.endsWith('.heic')) {
        heicList.push(image);
      }
    });
    setTimeout(async () => {
      spinner.success({ text: `Found ${imageList.length + heicList.length} images` });
      if (heicList.length > 0) {
        const bar = new cliProgress.SingleBar({
          format: 'Converting HEIC |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total}',
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true
        });
        let processedImages = 0;

        bar.start(heicList.length, processedImages, {
          speed: "N/A"
        });

        for (let heic of heicList) {
          await convertHeicToJpeg(heic);
          imageList.push(heic.replace('.heic', '_wm-temp.jpg'));
          processedImages++;
          bar.update(processedImages);
        }
        bar.stop();
        createSpinner('HEIC images processed successfully').success();
      }
      await processImages(imageList);
      cleanup();
    }, 1500);
  });
}

async function cleanup() {
  const spinner = createSpinner('Cleaning up temporary files...').start();
  fs.readdir(globalConfig.input, function (err, filenames) {
    if (err) {
      spinner.error({ text: 'Error occurred while reading files' });
      process.exit(1);
    }
    filenames.forEach(function (filename) {
      if (filename.includes('_wm-temp')) {
        fs.unlinkSync(globalConfig.input + filename);
      }
    });
    spinner.success({ text: 'Temporary files removed.' });
  });
}

async function convertHeicToJpeg(heic) {
  const heicData = fs.readFileSync(globalConfig.input + heic);
  const jpegBuffer = await heicConvert({
    buffer: heicData,
    format: 'JPEG',
    quality: 1
  });

  fs.writeFileSync(globalConfig.input + heic.replace('.heic', '_wm-temp.jpg'), jpegBuffer);
}

async function processImages(imageList) {
  const bar = new cliProgress.SingleBar({
    format: 'Processing images |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });
  let processedImages = 0;

  bar.start(imageList.length, processedImages, {
    speed: "N/A"
  });

  for (let image of imageList) {
    await addWatermark(image);
    processedImages++;
    bar.update(processedImages);
  }

  bar.stop();
  createSpinner('All images processed successfully').success();
}

async function addWatermark(file) {
  let img = await Jimp.read(globalConfig.input + file);
  let logo = await Jimp.read(globalConfig.watermark);
  logo.resize(img.bitmap.width / 8, Jimp.AUTO);
  logo.opacity(globalConfig.opacity);

  switch (globalConfig.location) {
    case 'Bottom right':
      img.composite(logo, img.bitmap.width - logo.bitmap.width, img.bitmap.height - logo.bitmap.height, [Jimp.BLEND_DESTINATION_OVER]);
      break;
    case 'Bottom left':
      img.composite(logo, 0, img.bitmap.height - logo.bitmap.height, [Jimp.BLEND_DESTINATION_OVER]);
      break;
    case 'Top right':
      img.composite(logo, img.bitmap.width - logo.bitmap.width, 0, [Jimp.BLEND_DESTINATION_OVER]);
      break;
    case 'Top left':
      img.composite(logo, 0, 0, [Jimp.BLEND_DESTINATION_OVER]);
      break;
  }

  if (!fs.existsSync(globalConfig.output)) {
    fs.mkdirSync(globalConfig.output, { recursive: true });
  }

  img.write(globalConfig.output + file.replace('_wm-temp', '_heic'));
}

splashScreen();