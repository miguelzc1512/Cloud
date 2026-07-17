const fs = require('fs');
let code = fs.readFileSync('src/components/PhotosView.tsx', 'utf8');

// Fix PhotosView end
code = code.replace(
  '      <PhotoViewerUI onDelete={onDelete} />\n    </div>\n  );\n}',
  '      <PhotoViewerUI onDelete={onDelete} />\n    </div>\n    <TimelineScrollbar \n      scrollContainerRef={scrollContainerRef} \n      dependencies={[orderedGroups]} \n    />\n    </>\n  );\n}'
);

// Fix PhotoViewerUI end
code = code.replace(
  '      <PhotoViewerUI />\n    </div>\n    \n    <TimelineScrollbar \n      scrollContainerRef={scrollContainerRef} \n      dependencies={[orderedGroups]} \n    />\n    </>\n  );\n};',
  '    </div>\n  );\n};'
);

fs.writeFileSync('src/components/PhotosView.tsx', code);
console.log("Fixed!");
