import dnd from '../lib/dnd.js';
import { $ } from '../lib/$.js';
import CodeMirror from '../lib/cm.js';
import { line2bas, file2txt, line2txt, file2bas } from 'txt2bas';
import './basic-syntax.js';
import save from '../lib/save.js';
import { decode } from '../lib/unpack/lib.js';
import { generateBlock } from '../lib/audio/index.js';
import { createWavFromBuffer } from '../lib/audio/make-wav.js';
import { loadGist } from '../lib/gist.js';

function localSave() {
  sessionStorage.setItem('code', cm.getValue());
}

const ta = $('textarea')[0];
const code = sessionStorage.getItem('code');
if (code) {
  ta.value = code;
}

const cm = CodeMirror.fromTextArea(ta, {
  mode: 'text/x-basic',
  lineWrapping: true,
  viewportMargin: Infinity,
  styleActiveLine: true,
  autoCloseBrackets: true,
  lint: true,
});

cm.getWrapperElement().addEventListener('click', (e) => {
  if (e.altKey) {
    let onToken = e.target.classList.contains('cm-goto');

    if (onToken) {
      const fnSearch = e.target.classList.contains('cm-goto-fn');
      let needle = e.target.innerText.trim();
      const seed = needle;
      if (fnSearch) {
        needle = 'DEFPROC ' + needle + '(';
      } else {
        if (needle.startsWith('%')) {
          needle = needle.substring(1);
        }
        console.log('num search');
        needle += ' ';
      }

      let target = null;
      cm.eachLine((line) => {
        const { text } = line;
        if (fnSearch) {
          if (text.includes(needle)) target = cm.getLineNumber(line);
        } else if (text.startsWith(needle)) {
          target = cm.getLineNumber(line);
        }
      });

      if (target !== null) {
        cm.setCursor({ line: target, ch: needle.toString().length });
      } else {
        console.log(`No ${fnSearch ? 'function' : 'line'} matching ${seed}`);
      }
    }
  }
});

cm.on('keydown', (cm, event) => {
  if (event.altKey) {
    document.body.classList.add('goto');
  } else {
    document.body.classList.remove('goto');
  }
  if (event.key === 'Enter') {
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line);

    if (line.trim() === '' || cursor.ch === 0) {
      return;
    }

    const newLine = line2bas(line);

    try {
      // then sort all the lines and put the cursor back in the right place
      const lines = [];
      let length = 0;
      let inserted = false;
      let removed = false;
      cm.eachLine(({ text, line: lineNumber }) => {
        // FIXME: line isn't a thing
        if (lineNumber === line) {
          return; // skip the newly inserted line
        }
        if (text.trim().length > 0) {
          const data = line2bas(text);
          if (data.lineNumber === newLine.lineNumber) {
            inserted = true;
            // >1 because all lines include 0x0d
            // allows us to replace and remove lines
            if (newLine.length > 1) {
              lines.push(newLine);
              length += newLine.basic.length;
            } else {
              removed = true;
            }
          } else {
            lines.push(data);
            length += data.basic.length;
          }
        }
      });

      if (!inserted) {
        lines.push(newLine);
        length += newLine.basic.length;
      }

      lines.sort((a, b) => {
        return a.lineNumber < b.lineNumber ? -1 : 1;
      });

      // recompile the text
      let offset = 0;
      const basic = new Uint8Array(length);
      let insertLine = 0;
      lines.forEach((line, i) => {
        basic.set(line.basic, offset);
        if (line.lineNumber === newLine.lineNumber) {
          insertLine = i;
        }
        offset += line.basic.length;
      });

      const res = line2txt(basic);

      cm.setValue(res);
      const scroll = cm.getScrollerElement().scrollTop;

      // attempt to put the cursor back in the best spot
      if (removed) {
        cm.setCursor(cursor);
      } else {
        let content = '\n';
        if (event.shiftKey) {
          const lineNumber = newLine.lineNumber;
          const next =
            lines.map((_) => _.lineNumber).find((_) => _ > lineNumber) ||
            lineNumber + 20;

          let d = lineNumber + (((next - lineNumber) / 2) | 0);
          if ((d !== next) & (d !== lineNumber)) {
            if (d - lineNumber > 10) d = lineNumber + 10;
            content = `${d}  `;
            cm.replaceRange('\n', { line: insertLine + 1, ch: 0 });
          }
        }

        cm.replaceRange(content, {
          line: insertLine + 1,
          ch: content.length - 1,
        });
        cm.setCursor({
          line: insertLine + 1,
          ch: content.length - 1,
        });

        // microtick to put the scrollbar back
        Promise.resolve(0).then(() => {
          cm.getScrollerElement().scrollTop = scroll;
        });
      }

      event.preventDefault();
    } catch (e) {
      console.error(e);
    }

    localSave();
  }
});

$('button').on('click', (e) => {
  const { action } = e.target.dataset;
  download(action);
});

function download(action) {
  const filename = prompt('Program name?', 'untitled');

  if (!filename || filename.trim().length === 0) {
    return;
  }

  /*   const lines = [];
  let length = 0;
  cm.eachLine(({ text }) => {
    if (text.trim().length > 0) {
      const data = line2bas(text);
      lines.push(data);
      length += data.basic.length;
    }
  });

  lines.sort((a, b) => {
    return a.lineNumber < b.lineNumber ? -1 : 1;
  });

  let offset = 0;
  const basic = new Uint8Array(length);
  lines.forEach((line) => {
    basic.set(line.basic, offset);
    offset += line.basic.length;
  });
 */

  if (action === 'wav') {
    const basic = file2bas(cm.getValue(), action, filename, false);
    const param1 = new DataView(basic.buffer).getUint16(0, false); // ?
    const res = generateBlock({
      type: 'PROGRAM',
      ctx: new window.AudioContext(),
      data: basic,
      param1,
      filename,
    });

    const wav = createWavFromBuffer(res.getChannelData(0), 44100);

    const bufferLists = [];
    while (!wav.eof()) {
      bufferLists.push(wav.getBuffer(1000));
    }

    save(bufferLists, filename + '.wav');
    cm.setValue(line2txt(basic));
  } else {
    let file = file2bas(cm.getValue(), action, filename);
    save(file, filename + (action === '3dos' ? '.bas' : '.tap'));
    cm.setValue(file2txt(file));
  }
}

CodeMirror.commands.save = () => download('3dos');

dnd(document.body, (file) => {
  if (file[0] === 0x13) {
    console.log('decode from tap');
    cm.setValue(file2txt(file, 'tap'));
  } else if (file[0] === 0x50) {
    cm.setValue(file2txt(file, '3dos'));
  } else {
    cm.setValue(decode(file));
  }
  localSave();
});

if (window.location.search) {
  loadGist().then((file) => {
    if (file) cm.setValue(file);
  });
}
