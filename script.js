document.addEventListener('DOMContentLoaded', function() {
    setupQuadrants();
    setupNewTableIcon();
    setupSearch();
    loadTables();

    
    const actionButtons = document.querySelectorAll('#action-buttons button');
    actionButtons.forEach(button => {
        button.addEventListener('click', function() {
            addClickAnimation(button);
        });
    });

    const clearButtons = document.querySelectorAll('.clear-btn');
    clearButtons.forEach(button => {
        button.addEventListener('click', function() {
            addClickAnimation(button);
        });
    });

    
    document.addEventListener('keydown', handleKeyDown);
});

let selectedCell = null;
let selectedTable = null;
let draggedFromQuadrant = null;
let tables = {
    quadrant1: null,
    quadrant2: null,
    quadrant3: null,
    quadrant4: null
};
let undoStack = [];
let redoStack = [];

function setupQuadrants() {
    const quadrants = document.querySelectorAll('.quadrant');
    quadrants.forEach(q => {
        const horizontalResizer = document.createElement('div');
        horizontalResizer.className = 'resizer horizontal';
        const verticalResizer = document.createElement('div');
        verticalResizer.className = 'resizer vertical';
        q.appendChild(horizontalResizer);
        q.appendChild(verticalResizer);

        setupResizer(horizontalResizer, 'horizontal');
        setupResizer(verticalResizer, 'vertical');

        q.addEventListener('dragover', allowDrop);
        q.addEventListener('drop', drop);
    });
}

function setupResizer(resizer, direction) {
    resizer.addEventListener('mousedown', function(e) {
        e.preventDefault();
        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', stopResize);

        function resize(e) {
            const quadrantContainer = document.getElementById('quadrant-container');
            const rect = quadrantContainer.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;

            if (direction === 'horizontal') {
                quadrantContainer.style.gridTemplateRows = `${offsetY}px 1fr`;
            } else {
                quadrantContainer.style.gridTemplateColumns = `${offsetX}px 1fr`;
            }
        }

        function stopResize() {
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', stopResize);
        }
    });
}

function allowDrop(e) {
    e.preventDefault();
}

function drag(e) {
    if (window.getSelection().toString()) {
        
        e.preventDefault();
        return;
    }
    selectedTable = e.target;
    draggedFromQuadrant = e.target.parentElement ? e.target.parentElement.id : null;

    
    selectedTable.classList.add('scale-out');
    selectedTable.addEventListener('animationend', function() {
        selectedTable.classList.remove('scale-out');
    }, { once: true });
}

function drop(e) {
    e.preventDefault();
    const quadrantId = e.target.id || e.target.parentElement.id;
    if (tables[quadrantId] === null) {
        if (selectedTable.id === 'new-table-icon') {
            const tableId = `table${Date.now()}`; 
            const tableContainer = createTableContainer(tableId);
            e.target.appendChild(tableContainer);
            tables[quadrantId] = tableId;
            saveTable(tableId);
        } else {
            const originalQuadrant = selectedTable.parentElement.parentElement.id;
            e.target.appendChild(selectedTable.parentElement); 
            tables[quadrantId] = selectedTable.id;
            if (originalQuadrant) {
                tables[originalQuadrant] = null;
            }

            
            selectedTable.classList.add('scale-in');
            selectedTable.addEventListener('animationend', function() {
                selectedTable.classList.remove('scale-in');
            }, { once: true });
        }
        saveTables();
    }
}



function addClickAnimation(button) {
    button.classList.add('button-click');
    button.addEventListener('animationend', function() {
        button.classList.remove('button-click');
    }, { once: true });
}

function createTableContainer(id) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'fitted';

    const table = document.createElement('table');
    table.id = id;
    table.draggable = true;
    table.classList.add('swing-in'); 
    table.addEventListener('dragstart', drag);
    table.addEventListener('dragend', function() {
        if (draggedFromQuadrant && !selectedTable.parentElement) {
            tables[draggedFromQuadrant] = null;
            saveTables();
        }
        selectedTable = null;
        draggedFromQuadrant = null;
    });
    resetTableContent(table);
    setupTableListeners(table);

    tableContainer.appendChild(table);

    return tableContainer;
}


document.addEventListener('animationend', function(event) {
    if (event.animationName === 'swingIn') {
        event.target.classList.remove('swing-in');
    }
});

function setupNewTableIcon() {
    const newTableIcon = document.getElementById('new-table-icon');
    newTableIcon.addEventListener('dragstart', function(e) {
        selectedTable = newTableIcon;
    });
}

function setupTableListeners(table) {
    table.addEventListener('dblclick', function(event) {
        let target = event.target;
        if (target.classList.contains('editable-header') || target.tagName === 'TD') {
            let input = document.createElement('input');
            input.type = 'text';
            input.className = 'edit-input';
            input.value = target.innerText;
            target.innerText = '';
            target.appendChild(input);
            input.focus();
            input.onblur = function() {
                target.innerText = this.value;
                saveTable(table.id);
            };
        }
    });

    table.addEventListener('click', function(event) {
        if (event.target.tagName === 'TD' || event.target.tagName === 'TH') {
            if (selectedCell) {
                selectedCell.classList.remove('selected');
            }
            selectedCell = event.target;
            selectedCell.classList.add('selected');
        }
    });
}

function toggleHorizontalScroll(table) {
    const columnCount = table.rows[0].cells.length - 1; 
    const tableContainer = table.parentElement;
    if (tableContainer) {
        if (columnCount > 26) {
            tableContainer.classList.add('scrollable-horizontal');
        } else {
            tableContainer.classList.remove('scrollable-horizontal');
        }
    } else {
        console.error('toggleHorizontalScroll: tableContainer is null for table:', table);
    }
}

function addRowToSelected() {
    if (!selectedCell) return;
    let table = selectedCell.closest('table');
    let rowIndex = selectedCell.parentElement.rowIndex;
    let newRow = table.insertRow(rowIndex + 1);
    for (let i = 0; i < table.rows[0].cells.length; i++) {
        let newCell = newRow.insertCell(-1);
        newCell.innerHTML = '';
        if (i === 0) {
            newCell.classList.add('editable-header');
        }
    }
    updateRowHeaders(table);
    saveTable(table.id);

    undoStack.push({
        type: 'addRow',
        tableId: table.id,
        rowIndex: rowIndex + 1
    });
    redoStack = [];
}

function addColumnToSelected() {
    if (!selectedCell) return;
    let table = selectedCell.closest('table');
    let colIndex = selectedCell.cellIndex + 1;

    let headerRow = table.querySelector('#headerRow');
    let newHeader = document.createElement('th');
    newHeader.classList.add('editable-header');
    headerRow.insertBefore(newHeader, headerRow.cells[colIndex]);

    for (let i = 1; i < table.rows.length; i++) {
        let newCell = table.rows[i].insertCell(colIndex);
        newCell.innerHTML = '';
    }

    for (let i = 1; i < headerRow.cells.length; i++) {
        let columnName = '';
        let dividend = i;
        let remainder;
        while (dividend > 0) {
            remainder = (dividend - 1) % 26;
            columnName = String.fromCharCode('A'.charCodeAt(0) + remainder) + columnName;
            dividend = Math.floor((dividend - remainder) / 26);
        }
        headerRow.cells[i].innerHTML = columnName;
    }

    toggleHorizontalScroll(table);
    saveTable(table.id);

    undoStack.push({
        type: 'addColumn',
        tableId: table.id,
        colIndex: colIndex
    });
    redoStack = [];
}

function deleteSelectedCell() {
    if (!selectedCell) return;

    const table = selectedCell.closest('table');
    const rowIndex = selectedCell.parentElement.rowIndex;
    const colIndex = selectedCell.cellIndex;
    const oldValue = selectedCell.innerHTML;

    undoStack.push({
        type: 'cellChange',
        tableId: table.id,
        rowIndex,
        colIndex,
        oldValue,
        newValue: ''
    });
    redoStack = [];

    selectedCell.innerHTML = '';
    saveTable(table.id);
}

function deleteSelectedRow() {
    if (!selectedCell) return;
    let table = selectedCell.closest('table');
    let rowIndex = selectedCell.parentElement.rowIndex;

    const rowCells = Array.from(table.rows[rowIndex].cells).map(cell => cell.innerHTML);
    undoStack.push({
        type: 'deleteRow',
        tableId: table.id,
        rowIndex: rowIndex,
        rowCells: rowCells
    });
    redoStack = [];

    table.deleteRow(rowIndex);
    updateRowHeaders(table);
    saveTable(table.id);
}

function deleteSelectedColumn() {
    if (!selectedCell) return;
    let table = selectedCell.closest('table');
    let colIndex = selectedCell.cellIndex;

    const colCells = Array.from(table.rows).map(row => row.cells[colIndex].innerHTML);
    undoStack.push({
        type: 'deleteColumn',
        tableId: table.id,
        colIndex: colIndex,
        colCells: colCells
    });
    redoStack = [];

    for (let i = 0; i < table.rows.length; i++) {
        table.rows[i].deleteCell(colIndex);
    }
    updateColumnHeaders(table);
    toggleHorizontalScroll(table);
    saveTable(table.id);
}

function resetSelectedTable() {
    if (!selectedCell) return;
    let table = selectedCell.closest('table');

    const tableData = Array.from(table.rows).map(row => Array.from(row.cells).map(cell => cell.innerHTML));
    undoStack.push({
        type: 'resetTable',
        tableId: table.id,
        tableData: tableData
    });
    redoStack = [];

    resetTableContent(table);
    toggleHorizontalScroll(table);
    saveTable(table.id);
}

function resetTableContent(table) {
    table.innerHTML = `
        <thead>
            <tr id="headerRow">
                <th class="editable-header">#</th>
                <th class="editable-header">A</th>
                <th class="editable-header">B</th>
                <th class="editable-header">C</th>
            </tr>
        </thead>
        <tbody>
            <tr><td class="editable-header">1</td><td></td><td></td><td></td></tr>
            <tr><td class="editable-header">2</td><td></td><td></td><td></td></tr>
            <tr><td class="editable-header">3</td><td></td><td></td><td></td></tr>
        </tbody>
    `;
}

function exportSelectedTableToCSV() {
    if (!selectedCell) return;
    let table = selectedCell.closest('table');
    let csvContent = '';
    for (let i = 0; i < table.rows.length; i++) {
        let row = table.rows[i];
        let rowData = [];
        for (let j = 0; j < row.cells.length; j++) {
            rowData.push('"' + row.cells[j].innerText.replace(/"/g, '""') + '"');
        }
        csvContent += rowData.join(',') + '\r\n';
    }
    let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    let link = document.createElement('a');
    let url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function saveTable(tableId) {
    const table = document.getElementById(tableId);
    if (!table) {
        console.error(`Table with ID ${tableId} not found`);
        return;
    }
    let tableData = [];
    for (let i = 0, row; row = table.rows[i]; i++) {
        let rowData = [];
        for (let j = 0, col; col = row.cells[j]; j++) {
            rowData.push(col.innerHTML);
        }
        tableData.push(rowData);
    }
    localStorage.setItem(tableId, JSON.stringify(tableData));
}

function loadTable(tableId) {
    let data = localStorage.getItem(tableId);
    if (data) {
        let tableData = JSON.parse(data);
        rebuildTable(tableId, tableData);
    } else {
        resetTableContent(document.getElementById(tableId));
        saveTable(tableId);
    }
}

function rebuildTable(tableId, tableData) {
    let table = document.getElementById(tableId);
    let headerRow = table.querySelector('#headerRow');
    headerRow.innerHTML = ''; 
    tableData[0].forEach(header => {
        let th = document.createElement('th');
        th.innerHTML = header;
        th.classList.add('editable-header');
        headerRow.appendChild(th);
    });
    let tbody = table.querySelector('tbody');
    tbody.innerHTML = ''; 
    tableData.slice(1).forEach(rowData => {
        let tr = tbody.insertRow();
        rowData.forEach((cell, index) => {
            let td = tr.insertCell();
            td.innerHTML = cell;
            if (index === 0) {
                td.classList.add('editable-header');
            }
        });
    });

    toggleHorizontalScroll(table);
}

function saveTables() {
    const tableLocations = {};
    Object.keys(tables).forEach(key => {
        if (tables[key]) {
            const tableId = tables[key];
            const table = document.getElementById(tableId);
            if (table) {
                saveTable(tableId);
                tableLocations[key] = tableId;
            } else {
                console.error(`Table with ID ${tableId} not found in quadrant ${key}`);
            }
        }
    });
    localStorage.setItem('tableLocations', JSON.stringify(tableLocations));
}

function loadTables() {
    const tableLocations = JSON.parse(localStorage.getItem('tableLocations'));
    if (tableLocations) {
        Object.keys(tableLocations).forEach(key => {
            tables[key] = tableLocations[key];
            const tableContainer = createTableContainer(tables[key]);
            document.getElementById(key).appendChild(tableContainer);
            loadTable(tables[key]);
        });
    } else {
        Object.keys(tables).forEach((key, index) => {
            const tableId = `table${Date.now() + index}`;
            tables[key] = tableId;
            let tableContainer = createTableContainer(tables[key]);
            document.getElementById(key).appendChild(tableContainer);
            loadTable(tables[key]);
        });
    }
}

function clearQuadrant(quadrantId) {
    const quadrant = document.getElementById(quadrantId);
    const tableId = tables[quadrantId];

    if (tableId) {
        const tableContainer = document.getElementById(tableId).parentElement;
        if (tableContainer && quadrant.contains(tableContainer)) {
            const table = tableContainer.querySelector('table');
            table.classList.add('slide-out'); 

            
            table.addEventListener('animationend', function() {
                if (quadrant.contains(tableContainer)) {
                    quadrant.removeChild(tableContainer);
                }
                tables[quadrantId] = null;
                localStorage.removeItem(tableId);
                saveTables();
            }, { once: true });
        }
    }
}

function updateRowHeaders(table) {
    for (let i = 1; i < table.rows.length; i++) {
        let firstCell = table.rows[i].cells[0];
        firstCell.innerHTML = i;
        firstCell.classList.add('editable-header');
    }
}

function updateColumnHeaders(table) {
    let headerRow = table.querySelector('#headerRow');
    for (let i = 1; i < headerRow.cells.length; i++) {
        let columnName = '';
        let dividend = i;
        let remainder;
        while (dividend > 0) {
            remainder = (dividend - 1) % 26;
            columnName = String.fromCharCode('A'.charCodeAt(0) + remainder) + columnName;
            dividend = Math.floor((dividend - remainder) / 26);
        }
        headerRow.cells[i].innerHTML = columnName;
    }
}

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', function() {
        const query = searchInput.value.toLowerCase();
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            let found = false;
            for (let i = 0; i < table.rows.length; i++) {
                for (let j = 0; j < table.rows[i].cells.length; j++) {
                    const cell = table.rows[i].cells[j];
                    if (cell.innerText.toLowerCase().includes(query)) {
                        cell.classList.add('highlight');
                        found = true;
                    } else {
                        cell.classList.remove('highlight');
                    }
                }
            }
            if (query === '') {
                table.querySelectorAll('.highlight').forEach(cell => {
                    cell.classList.remove('highlight');
                });
                table.style.display = '';
            } else {
                table.style.display = found ? '' : 'none';
            }
        });
    });
}

function handleKeyDown(event) {
    if (!selectedCell) return;

    let table = selectedCell.closest('table');
    let rowIndex = selectedCell.parentElement.rowIndex;
    let colIndex = selectedCell.cellIndex;

    switch (event.key) {
        case 'ArrowUp':
            if (rowIndex > 0) {
                setSelectedCell(table.rows[rowIndex - 1].cells[colIndex]);
            }
            break;
        case 'ArrowDown':
            if (event.ctrlKey){
                addRowToSelected()
            }
            else if (rowIndex < table.rows.length - 1) {
                setSelectedCell(table.rows[rowIndex + 1].cells[colIndex]);
            }
            break;
        case 'ArrowLeft':
            if (colIndex > 0) {
                setSelectedCell(table.rows[rowIndex].cells[colIndex - 1]);
            }
            break;
        case 'ArrowRight':
            if (event.ctrlKey){
                addColumnToSelected()
            }
            else if (colIndex < table.rows[rowIndex].cells.length - 1) {
                setSelectedCell(table.rows[rowIndex].cells[colIndex + 1]);
            }
            break;
        case 'Delete':
            if (event.ctrlKey)
            deleteSelectedCell();
            break;
        case '`':
            if (event.ctrlKey) {
                resetSelectedTable();
            }
            break;
        case 'z':
        case 'Z':
            if (event.ctrlKey) {
                undo();
            }
            break;
        case 'y':
        case 'Y':
            if (event.ctrlKey) {
                redo();
            }
            break;
    }
}

function setSelectedCell(cell) {
    if (selectedCell) {
        selectedCell.classList.remove('selected');
    }
    selectedCell = cell;
    selectedCell.classList.add('selected');
}

function undo() {
    if (undoStack.length === 0) return;
    const lastAction = undoStack.pop();
    redoStack.push(lastAction);
    applyAction(lastAction, true);
}

function redo() {
    if (redoStack.length === 0) return;
    const lastUndoneAction = redoStack.pop();
    undoStack.push(lastUndoneAction);
    applyAction(lastUndoneAction, false);
}

function applyAction(action, isUndo) {
    const { type, tableId, rowIndex, colIndex, oldValue, newValue, rowCells, colCells, tableData } = action;
    const table = document.getElementById(tableId);

    if (!table) return;

    switch (type) {
        case 'cellChange':
            const cell = table.rows[rowIndex].cells[colIndex];
            if (cell) {
                cell.innerHTML = isUndo ? oldValue : newValue;
            }
            break;
        case 'addRow':
            if (isUndo) {
                table.deleteRow(rowIndex);
            } else {
                let newRow = table.insertRow(rowIndex);
                for (let i = 0; i < table.rows[0].cells.length; i++) {
                    let newCell = newRow.insertCell(-1);
                    newCell.innerHTML = '';
                    if (i === 0) {
                        newCell.classList.add('editable-header');
                    }
                }
                updateRowHeaders(table);
            }
            break;
        case 'deleteRow':
            if (isUndo) {
                let newRow = table.insertRow(rowIndex);
                rowCells.forEach((cellContent, i) => {
                    let newCell = newRow.insertCell(-1);
                    newCell.innerHTML = cellContent;
                    if (i === 0) {
                        newCell.classList.add('editable-header');
                    }
                });
                updateRowHeaders(table);
            } else {
                table.deleteRow(rowIndex);
                updateRowHeaders(table);
            }
            break;
        case 'addColumn':
            if (isUndo) {
                for (let i = 0; i < table.rows.length; i++) {
                    table.rows[i].deleteCell(colIndex);
                }
                updateColumnHeaders(table);
                toggleHorizontalScroll(table);
            } else {
                let headerRow = table.querySelector('#headerRow');
                let newHeader = document.createElement('th');
                newHeader.classList.add('editable-header');
                headerRow.insertBefore(newHeader, headerRow.cells[colIndex]);

                for (let i = 1; i < table.rows.length; i++) {
                    let newCell = table.rows[i].insertCell(colIndex);
                    newCell.innerHTML = '';
                }

                updateColumnHeaders(table);
                toggleHorizontalScroll(table);
            }
            break;
        case 'deleteColumn':
            if (isUndo) {
                for (let i = 0; i < table.rows.length; i++) {
                    let newCell = table.rows[i].insertCell(colIndex);
                    newCell.innerHTML = colCells[i];
                }
                updateColumnHeaders(table);
                toggleHorizontalScroll(table);
            } else {
                for (let i = 0; i < table.rows.length; i++) {
                    table.rows[i].deleteCell(colIndex);
                }
                updateColumnHeaders(table);
                toggleHorizontalScroll(table);
            }
            break;
        case 'resetTable':
            if (isUndo) {
                rebuildTable(tableId, tableData);
            } else {
                resetTableContent(table);
                toggleHorizontalScroll(table);
            }
            break;
    }
    saveTable(tableId);
}
