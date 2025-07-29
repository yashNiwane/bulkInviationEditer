document.addEventListener('DOMContentLoaded', () => {
    // --- Global State & Config ---
    let currentStep = 1;
    let fabricCanvas = null;
    let baseImage = null; // Original full-resolution image object
    let textObject = null;
    let dataToProcess = [];

    // --- DOM Elements ---
    const stepPanels = document.querySelectorAll('.step-panel');
    const uploadArea = document.getElementById('uploadArea');
    const imageInput = document.getElementById('image-input');
    
    // Editor controls
    const fontSizeInput = document.getElementById('font-size');
    const fontColorInput = document.getElementById('font-color');
    const fontFamilyInput = document.getElementById('font-family');

    // Data input
    const selectManualBtn = document.getElementById('select-manual');
    const selectExcelBtn = document.getElementById('select-excel');
    const manualInputPanel = document.getElementById('manual-input-panel');
    const excelInputPanel = document.getElementById('excel-input-panel');
    const manualDataInput = document.getElementById('manual-data');
    const excelInput = document.getElementById('excel-input');
    const excelStatus = document.getElementById('excel-status');
    const dataNextBtn = document.getElementById('data-next-btn');

    // Generation
    const imageCountSpan = document.getElementById('image-count');
    const generateBtn = document.getElementById('generate-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const resultsContainer = document.getElementById('results-container');
    const imageResults = document.getElementById('image-results');
    const downloadZipBtn = document.getElementById('download-zip-btn');
    
    // --- Navigation ---
    window.navigateToStep = (stepNumber) => {
        currentStep = stepNumber;
        stepPanels.forEach(panel => {
            panel.classList.toggle('active', panel.dataset.step == currentStep);
        });
    };

    // --- Step 1: Image Upload ---
    const handleImageUpload = (file) => {
        if (!file || !file.type.startsWith('image/')) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            baseImage = new Image();
            baseImage.src = e.target.result;
            baseImage.onload = () => {
                initializeEditor(baseImage.src);
                navigateToStep(2);
            };
        };
        reader.readAsDataURL(file);
    };

    uploadArea.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0]));
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => { e.preventDefault(); uploadArea.classList.remove('dragover'); handleImageUpload(e.dataTransfer.files[0]); });

    // --- Step 2: Editor (Fabric.js) ---
    const initializeEditor = (imageUrl) => {
        if (fabricCanvas) {
            fabricCanvas.dispose();
        }
        fabricCanvas = new fabric.Canvas('editor-canvas');
        
        fabric.Image.fromURL(imageUrl, (img) => {
            // Scale image to fit container
            const containerWidth = document.querySelector('.editor-container').clientWidth;
            const scale = containerWidth / img.width;
            img.scale(scale);

            // Set canvas dimensions and background
            fabricCanvas.setWidth(img.width * scale);
            fabricCanvas.setHeight(img.height * scale);
            fabricCanvas.setBackgroundImage(img, fabricCanvas.renderAll.bind(fabricCanvas));

            // Add editable text box
            textObject = new fabric.Textbox('Your Text Here', {
                left: 50,
                top: 50,
                width: 250,
                fontSize: 40,
                fill: '#000000',
                fontFamily: 'Arial',
                textAlign: 'center',
                cornerColor: '#005bea',
                cornerStyle: 'circle',
                transparentCorners: false,
            });
            fabricCanvas.add(textObject);
            fabricCanvas.setActiveObject(textObject);
        });
    };

    // Wire up editor controls
    fontSizeInput.addEventListener('input', (e) => {
        if (textObject) {
            textObject.set('fontSize', parseInt(e.target.value, 10));
            fabricCanvas.renderAll();
        }
    });
    fontColorInput.addEventListener('input', (e) => {
        if (textObject) {
            textObject.set('fill', e.target.value);
            fabricCanvas.renderAll();
        }
    });
    fontFamilyInput.addEventListener('input', (e) => {
        if (textObject) {
            textObject.set('fontFamily', e.target.value);
            fabricCanvas.renderAll();
        }
    });

    // --- Step 3 & 4: Data Input ---
    selectManualBtn.addEventListener('click', () => {
        manualInputPanel.classList.remove('hidden');
        excelInputPanel.classList.add('hidden');
        navigateToStep(4);
    });
    selectExcelBtn.addEventListener('click', () => {
        excelInputPanel.classList.remove('hidden');
        manualInputPanel.classList.add('hidden');
        navigateToStep(4);
    });
    
    const processAndValidateData = () => {
        const manualData = manualDataInput.value.split('\n').filter(line => line.trim() !== '');
        dataToProcess = [...new Set(manualData)];
        
        dataNextBtn.disabled = dataToProcess.length === 0;
        imageCountSpan.textContent = dataToProcess.length;
    };
    
    manualDataInput.addEventListener('input', processAndValidateData);
    dataNextBtn.addEventListener('click', () => navigateToStep(5));
    
    excelInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                const excelData = json.map(row => row[0]).filter(Boolean);

                manualDataInput.value = excelData.join('\n');
                excelStatus.textContent = `✅ Loaded ${excelData.length} names.`;
                processAndValidateData();
            } catch (error) {
                excelStatus.textContent = `❌ Error reading file.`;
            }
        };
        reader.readAsArrayBuffer(file);
    });

    // --- Step 5: Generation ---
    const generateSingleImage = (text) => {
        // Create a temporary, full-resolution canvas in memory
        const generationCanvas = new fabric.StaticCanvas(null, {
            width: baseImage.naturalWidth,
            height: baseImage.naturalHeight
        });

        return new Promise(resolve => {
            // Load the full-res background
            fabric.Image.fromURL(baseImage.src, (img) => {
                generationCanvas.setBackgroundImage(img, () => {
                    // Critical: Calculate scale between preview and full-res
                    const scale = baseImage.naturalWidth / fabricCanvas.getWidth();
                    
                    // Clone the text object and scale its properties
                    textObject.clone(cloned => {
                        cloned.set({
                            text: text, // Set the new text
                            left: textObject.left * scale,
                            top: textObject.top * scale,
                            width: textObject.width * textObject.scaleX * scale,
                            height: textObject.height * textObject.scaleY * scale,
                            fontSize: textObject.fontSize * scale,
                            scaleX: 1, // Reset scale after applying to width/height
                            scaleY: 1
                        });
                        generationCanvas.add(cloned);
                        generationCanvas.renderAll();
                        
                        // Export canvas to a blob
                        generationCanvas.getElement().toBlob(blob => {
                            resolve(blob);
                            generationCanvas.dispose();
                        }, 'image/png');
                    });
                });
            });
        });
    };
    
    generateBtn.addEventListener('click', async () => {
        generateBtn.disabled = true;
        progressContainer.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
        imageResults.innerHTML = '';
        const generatedBlobs = [];

        for (let i = 0; i < dataToProcess.length; i++) {
            const text = dataToProcess[i];
            const blob = await generateSingleImage(text);
            generatedBlobs.push({ name: text, blob });
            
            const percent = ((i + 1) / dataToProcess.length) * 100;
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `Generated ${i + 1} of ${dataToProcess.length}`;

            const img = document.createElement('img');
            img.src = URL.createObjectURL(blob);
            imageResults.appendChild(img);
        }

        resultsContainer.classList.remove('hidden');
        generateBtn.disabled = false;
        
        // Setup download button
        downloadZipBtn.onclick = () => downloadAllAsZip(generatedBlobs);
    });

    const downloadAllAsZip = (blobs) => {
        const zip = new JSZip();
        blobs.forEach(({ name, blob }, i) => {
            const fileName = `${name.replace(/[^a-z0-9]/gi, '_') || 'image'}_${i}.png`;
            zip.file(fileName, blob);
        });

        zip.generateAsync({ type: 'blob' }).then((content) => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = 'customized_images.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    };
});