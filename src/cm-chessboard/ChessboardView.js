/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-chessboard
 * License: MIT, see file 'LICENSE'
 */

import {SQUARE_COORDINATES} from "./ChessboardState.js"
import {ChessboardMoveInput} from "./ChessboardMoveInput.js"
import {COLOR, MOVE_INPUT_MODE, INPUT_EVENT_TYPE} from "./Chessboard.js"
import {ChessboardPiecesAnimation} from "./ChessboardPiecesAnimation.js"

export class ChessboardView {

    constructor(chessboard, callbackAfterCreation) {
        this.animationRunning = false
        this.currentAnimation = null
        this.chessboard = chessboard
        this.moveInput = new ChessboardMoveInput(this, chessboard.state, chessboard.props,
            this.moveStartCallback.bind(this),
            this.moveDoneCallback.bind(this),
            this.moveCanceledCallback.bind(this)
        )
        this.animationQueue = []
        if (chessboard.props.sprite.cache) {
            this.cacheSprite()
        }
        if (chessboard.props.responsive) {
            this.resizeListener = this.handleResize.bind(this)
            window.addEventListener("resize", this.resizeListener)
        }
        if (chessboard.props.moveInputMode !== MOVE_INPUT_MODE.viewOnly) {
            this.pointerDownListener = this.pointerDownHandler.bind(this)
            this.chessboard.element.addEventListener("mousedown", this.pointerDownListener)
            this.chessboard.element.addEventListener("touchstart", this.pointerDownListener)
        }
        this.createSvgAndGroups()
        this.updateMetrics()
        callbackAfterCreation()
        if (chessboard.props.responsive) {
            setTimeout(() => {
                this.handleResize()
            })
        }
    }

    pointerDownHandler(e) {
        this.moveInput.onPointerDown(e)
    }

    destroy() {
        this.moveInput.destroy()
        window.removeEventListener('resize', this.resizeListener)
        this.chessboard.element.removeEventListener("mousedown", this.pointerDownListener)
        this.chessboard.element.removeEventListener("touchstart", this.pointerDownListener)
        window.clearTimeout(this.resizeDebounce)
        window.clearTimeout(this.redrawDebounce)
        window.clearTimeout(this.drawPiecesDebounce)
        window.clearTimeout(this.drawMarkersDebounce)
        Svg.removeElement(this.svg)
        this.animationQueue = []
        if (this.currentAnimation) {
            cancelAnimationFrame(this.currentAnimation.frameHandle)
        }
    }

    // Sprite //

    cacheSprite() {
        const wrapperId = "chessboardSpriteCache"
        if (!document.getElementById(wrapperId)) {
            const wrapper = document.createElement("div")
            wrapper.style.display = "none"
            wrapper.id = wrapperId
            document.body.appendChild(wrapper)
            const xhr = new XMLHttpRequest()
            xhr.open("GET", this.chessboard.props.sprite.url, true)
            xhr.onload = function () {
                wrapper.insertAdjacentHTML('afterbegin', xhr.response)
            }
            xhr.send()
        }
    }

    createSvgAndGroups() {
        if (this.svg) {
            Svg.removeElement(this.svg)
        }
        this.svg = Svg.createSvg(this.chessboard.element)
        let cssClass = this.chessboard.props.style.cssClass ? this.chessboard.props.style.cssClass : "default"
        if (this.chessboard.props.style.showBorder) {
            this.svg.setAttribute("class", "cm-chessboard has-border " + cssClass)
        } else {
            this.svg.setAttribute("class", "cm-chessboard " + cssClass)
        }
        this.updateMetrics()
        this.boardGroup = Svg.addElement(this.svg, "g", {class: "board"})
        this.coordinatesGroup = Svg.addElement(this.svg, "g", {class: "coordinates"})
        this.markersGroup = Svg.addElement(this.svg, "g", {class: "markers"})
        this.piecesGroup = Svg.addElement(this.svg, "g", {class: "pieces"})
    }

    updateMetrics() {
        this.width = this.chessboard.element.offsetWidth
        this.height = this.chessboard.element.offsetHeight
        if (this.chessboard.props.style.showBorder) {
            this.borderSize = this.width / 28
        } else {
            this.borderSize = this.width / 320
        }
        this.innerWidth = this.width - 2 * this.borderSize
        this.innerHeight = this.height - 2 * this.borderSize
        this.squareWidth = this.innerWidth / 8
        this.squareHeight = this.innerHeight / 8
        this.scalingX = this.squareWidth / this.chessboard.props.sprite.size
        this.scalingY = this.squareHeight / this.chessboard.props.sprite.size
        this.pieceXTranslate = (this.squareWidth / 2 - this.chessboard.props.sprite.size * this.scalingY / 2)
    }

    handleResize() {
        window.clearTimeout(this.resizeDebounce)
        this.resizeDebounce = setTimeout(() => {
            if (this.chessboard.props.style.aspectRatio) {
                this.chessboard.element.style.height = (this.chessboard.element.offsetWidth * this.chessboard.props.style.aspectRatio) + "px"
            }
            if (this.chessboard.element.offsetWidth !== this.width ||
                this.chessboard.element.offsetHeight !== this.height) {
                this.updateMetrics()
                this.redraw()
            }
            this.svg.setAttribute("width", "100%") // safari bugfix
            this.svg.setAttribute("height", "100%")
        })
    }

    redraw() {
        return new Promise((resolve) => {
            window.clearTimeout(this.redrawDebounce)
            this.redrawDebounce = setTimeout(() => {
                this.drawBoard()
                this.drawCoordinates()
                this.drawMarkers()
                this.setCursor()
            })
            this.drawPiecesDebounced(this.chessboard.state.squares, () => {
                resolve()
            })
        })
    }

    // Board //

    drawBoard() {
        while (this.boardGroup.firstChild) {
            this.boardGroup.removeChild(this.boardGroup.lastChild)
        }
        let boardBorder = Svg.addElement(this.boardGroup, "rect", {width: this.width, height: this.height})
        boardBorder.setAttribute("class", "border")
        if (this.chessboard.props.style.showBorder) {
            const innerPos = this.borderSize - this.borderSize / 9
            let borderInner = Svg.addElement(this.boardGroup, "rect", {
                x: innerPos,
                y: innerPos,
                width: this.width - innerPos * 2,
                height: this.height - innerPos * 2
            })
            borderInner.setAttribute("class", "border-inner")
        }
        for (let i = 0; i < 64; i++) {
            const index = this.chessboard.state.orientation === COLOR.white ? i : 63 - i
            const squareColor = ((9 * index) & 8) === 0 ? 'black' : 'white'
            const fieldClass = `square ${squareColor}`
            const point = this.squareIndexToPoint(index)
            const squareRect = Svg.addElement(this.boardGroup, "rect", {
                x: point.x, y: point.y, width: this.squareWidth, height: this.squareHeight
            })
            squareRect.setAttribute("class", fieldClass)
            squareRect.setAttribute("data-index", "" + index)
        }
    }

    drawCoordinates() {
        if (!this.chessboard.props.style.showCoordinates) {
            return
        }
        while (this.coordinatesGroup.firstChild) {
            this.coordinatesGroup.removeChild(this.coordinatesGroup.lastChild)
        }
        const inline = !this.chessboard.props.style.showBorder
        for (let file = 0; file < 8; file++) {
            let x = this.borderSize + (17 + this.chessboard.props.sprite.size * file) * this.scalingX
            let y = this.height - this.scalingY * 3.2
            let cssClass = "coordinate file"
            if (inline) {
                x = x + this.scalingX * 15.5
                if (this.chessboard.props.style.showBorder) {
                    y = y - this.scalingY * 11
                }
                cssClass += file % 2 ? " dark" : " light"
            }
            const textElement = Svg.addElement(this.coordinatesGroup, "text", {
                class: cssClass,
                x: x,
                y: y,
                style: `font-size: ${this.scalingY * 10}px`
            })
            if (this.chessboard.state.orientation === COLOR.white) {
                textElement.textContent = String.fromCharCode(97 + file)
            } else {
                textElement.textContent = String.fromCharCode(104 - file)
            }
        }
        for (let rank = 0; rank < 8; rank++) {
            let x = (this.borderSize / 3.7)
            let y = this.borderSize + 25 * this.scalingY + rank * this.squareHeight
            let cssClass = "coordinate rank"
            if (inline) {
                cssClass += rank % 2 ? " light" : " dark"
                if (this.chessboard.props.style.showBorder) {
                    x = x + this.scalingX * 10
                    y = y - this.scalingY * 15
                } else {
                    x = x + this.scalingX * 2
                    y = y - this.scalingY * 15
                }
            }
            const textElement = Svg.addElement(this.coordinatesGroup, "text", {
                class: cssClass,
                x: x,
                y: y,
                style: `font-size: ${this.scalingY * 10}px`
            })
            if (this.chessboard.state.orientation === COLOR.white) {
                textElement.textContent = 8 - rank
            } else {
                textElement.textContent = 1 + rank
            }
        }
    }

    // Pieces //

    drawPiecesDebounced(squares = this.chessboard.state.squares, callback = null) {
        window.clearTimeout(this.drawPiecesDebounce)
        this.drawPiecesDebounce = setTimeout(() => {
            this.drawPieces(squares)
            if (callback) {
                callback()
            }
        })
    }

    drawPieces(squares = this.chessboard.state.squares) {
        while (this.piecesGroup.firstChild) {
            this.piecesGroup.removeChild(this.piecesGroup.lastChild)
        }
        for (let i = 0; i < 64; i++) {
            const pieceName = squares[i]
            if (pieceName) {
                this.drawPiece(i, pieceName)
            }
        }
    }

    drawPiece(index, pieceName) {
        // console.log(index, pieceName)
        const pieceGroup = Svg.addElement(this.piecesGroup, "g")
        pieceGroup.setAttribute("data-piece", pieceName)
        pieceGroup.setAttribute("data-index", index)
        const point = this.squareIndexToPoint(index)
        const transform = (this.svg.createSVGTransform())
        transform.setTranslate(point.x, point.y)
        pieceGroup.transform.baseVal.appendItem(transform)
        const spriteUrl = this.chessboard.props.sprite.cache ? "" : this.chessboard.props.sprite.url
        const pieceUse = Svg.addElement(pieceGroup, "use", {
            href: `${spriteUrl}#${pieceName}`,
            class: "piece"
        })
        // center on square
        const transformTranslate = (this.svg.createSVGTransform())
        transformTranslate.setTranslate(this.pieceXTranslate, 0)
        pieceUse.transform.baseVal.appendItem(transformTranslate)
        // scale
        const transformScale = (this.svg.createSVGTransform())
        transformScale.setScale(this.scalingY, this.scalingY)
        pieceUse.transform.baseVal.appendItem(transformScale)
        return pieceGroup
    }

    setPieceVisibility(index, visible = true) {
        const piece = this.getPiece(index)
        if (visible) {
            piece.setAttribute("visibility", "visible")
        } else {
            piece.setAttribute("visibility", "hidden")
        }

    }

    getPiece(index) {
        return this.piecesGroup.querySelector(`g[data-index='${index}']`)
    }

    // Markers //

    drawMarkersDebounced() {
        window.clearTimeout(this.drawMarkersDebounce)
        this.drawMarkersDebounce = setTimeout(() => {
            this.drawMarkers()
        }, 10)
    }

    drawMarkers() {
        while (this.markersGroup.firstChild) {
            this.markersGroup.removeChild(this.markersGroup.firstChild)
        }
        this.chessboard.state.markers.forEach((marker) => {
                this.drawMarker(marker)
            }
        )
    }

    drawMarker(marker) {
        const markerGroup = Svg.addElement(this.markersGroup, "g")
        markerGroup.setAttribute("data-index", marker.index)
        const point = this.squareIndexToPoint(marker.index)
        const transform = (this.svg.createSVGTransform())
        transform.setTranslate(point.x, point.y)
        markerGroup.transform.baseVal.appendItem(transform)
        const spriteUrl = this.chessboard.props.sprite.cache ? "" : this.chessboard.props.sprite.url
        const markerUse = Svg.addElement(markerGroup, "use",
            {href: `${spriteUrl}#${marker.type.slice}`, class: "marker " + marker.type.class})
        const transformScale = (this.svg.createSVGTransform())
        transformScale.setScale(this.scalingX, this.scalingY)
        markerUse.transform.baseVal.appendItem(transformScale)
        return markerGroup
    }

    // animation queue //

    animatePieces(fromSquares, toSquares, callback) {
        this.animationQueue.push({fromSquares: fromSquares, toSquares: toSquares, callback: callback})
        if (!this.animationRunning) {
            this.nextPieceAnimationInQueue()
        }
    }

    nextPieceAnimationInQueue() {
        const nextAnimation = this.animationQueue.shift()
        if (nextAnimation !== undefined) {
            this.currentAnimation = new ChessboardPiecesAnimation(this, nextAnimation.fromSquares, nextAnimation.toSquares, this.chessboard.props.animationDuration / (this.animationQueue.length + 1), () => {
                if (!this.moveInput.draggablePiece) {
                    this.drawPieces(nextAnimation.toSquares)
                }
                this.nextPieceAnimationInQueue()
                if (nextAnimation.callback) {
                    nextAnimation.callback()
                }
            })
        }
    }

    // Callbacks //

    moveStartCallback(index) {
        if (this.chessboard.moveInputCallback) {
            return this.chessboard.moveInputCallback({
                chessboard: this.chessboard,
                type: INPUT_EVENT_TYPE.moveStart,
                square: SQUARE_COORDINATES[index]
            })
        } else {
            return true
        }
    }

    moveDoneCallback(fromIndex, toIndex) {
        if (this.chessboard.moveInputCallback) {
            return this.chessboard.moveInputCallback({
                chessboard: this.chessboard,
                type: INPUT_EVENT_TYPE.moveDone,
                squareFrom: SQUARE_COORDINATES[fromIndex],
                squareTo: SQUARE_COORDINATES[toIndex]
            })
        } else {
            return true
        }
    }

    moveCanceledCallback(reason, index) {
        if (this.chessboard.moveInputCallback) {
            this.chessboard.moveInputCallback({
                chessboard: this.chessboard,
                type: INPUT_EVENT_TYPE.moveCanceled,
                reason: reason,
                square: index ? SQUARE_COORDINATES[index] : undefined
            })
        }
    }

    // Helpers //

    setCursor() {
        this.chessboard.initialization.then(() => {
            if (this.chessboard.state.inputWhiteEnabled || this.chessboard.state.inputBlackEnabled || this.chessboard.boardClickListener) {
                this.boardGroup.setAttribute("class", "board input-enabled")
            } else {
                this.boardGroup.setAttribute("class", "board")
            }
        })
    }

    squareIndexToPoint(index) {
        let x, y
        if (this.chessboard.state.orientation === COLOR.white) {
            x = this.borderSize + (index % 8) * this.squareWidth
            y = this.borderSize + (7 - Math.floor(index / 8)) * this.squareHeight
        } else {
            x = this.borderSize + (7 - index % 8) * this.squareWidth
            y = this.borderSize + (Math.floor(index / 8)) * this.squareHeight
        }
        return {x: x, y: y}
    }

}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg"

export class Svg {

    /**
     * create the Svg in the HTML DOM
     * @param containerElement
     * @returns {Element}
     */
    static createSvg(containerElement = null) {
        let svg = document.createElementNS(SVG_NAMESPACE, "svg")
        if (containerElement) {
            svg.setAttribute("width", "100%")
            svg.setAttribute("height", "100%")
            containerElement.appendChild(svg)
        }
        return svg
    }

    /**
     * Add an Element to a SVG DOM
     * @param parent
     * @param name
     * @param attributes
     * @returns {Element}
     */
    static addElement(parent, name, attributes) {
        let element = document.createElementNS(SVG_NAMESPACE, name)
        if (name === "use") {
            attributes["xlink:href"] = attributes["href"] // fix for safari
        }
        for (let attribute in attributes) {
            if (attributes.hasOwnProperty(attribute)) {
                if (attribute.indexOf(":") !== -1) {
                    const value = attribute.split(":")
                    element.setAttributeNS("http://www.w3.org/1999/" + value[0], value[1], attributes[attribute])
                } else {
                    element.setAttribute(attribute, attributes[attribute])
                }
            }
        }
        parent.appendChild(element)
        return element
    }

    /**
     * Remove an Element from a SVG DOM
     * @param element
     */
    static removeElement(element) {
        element.parentNode.removeChild(element)
    }

}
