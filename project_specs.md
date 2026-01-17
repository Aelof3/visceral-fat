# GOALS
- python service
    - analyze MRI images
    - use analyzed MRI images to map out and color code visceral fat vs organs etc
    - create 3d model from the MRI images
- web interface
    - create web interface to display analyzed color coded results, organized by body position or importance/visceral fat amount
        - ability to toggle view between initial images, analyzed/color coded images, and the 3d model
        - original view:
            - expandable list displaying each of the images in order
        - analyzed/color coded view
            - expandable list displaying each of the analyzed images with color coded parts showing the visceral fat or organs etc
            - on hover, providde description (e.g. visceral fat, organ names, etc)
        - 3d model
            - show 3d model compiled from MRI images
            - have side panel list of analyzed images
                - clicking an images slice should show the 2d plane slice of the 3d model and hilight it
            - ability to toggle or hilight the visceral fat, organs, etc in the model

# PROJECT STRUCTURE
- backend: python using existing libraries to handle MRI images and mapping out of the visceral fat and other parts
- frontend: reactjs web app, threejs for 3d model viewing
- 3d model: preferably glb file(s)
- MRI images: DICOMM