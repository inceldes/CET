import { MenuItem, ipcRenderer } from "electron"
import { Color } from "base/common/color"
import { $, EventHelper, EventLike, EventType, addClass, addDisposableListener, append, hasClass, removeClass, removeNode } from "base/common/dom"
import { KeyCode, KeyCodeUtils } from "base/common/keyCodes"
import { Disposable } from "base/common/lifecycle"
import { MENU_ESCAPED_MNEMONIC_REGEX, MENU_MNEMONIC_REGEX, applyFill, parseAccelerator, cleanMnemonic } from "consts"
import { MenuBarOptions } from "../menubar-options"
import { IMenuOptions } from "./index"
import * as strings from "base/common/strings"

export interface IMenuItem {
	render(element: HTMLElement): void
	updateStyle(style: IMenuStyle): void
	onClick(event: EventLike): void
	dispose(): void
	isEnabled(): boolean
	isSeparator(): boolean
	focus(): void
	blur(): void
}

export interface IMenuStyle {
	foregroundColor?: Color
	backgroundColor?: Color
	selectionForegroundColor?: Color
	selectionBackgroundColor?: Color
	separatorColor?: Color
	svgColor?: Color
}

export class CETMenuItem extends Disposable implements IMenuItem {
	private _mnemonic?: KeyCode
	private _currentElement?: HTMLElement

	private labelElement?: HTMLElement
	private iconElement?: HTMLElement

	protected itemElement?: HTMLElement
	protected menuStyle?: IMenuStyle

	private radioGroup?: { start: number, end: number } // used only if item.type === "radio"

	// Temp
	private windowIcons = `{
    "check": "<svg viewBox='0 0 11 11'><path d='M3.8,9.3c-0.1,0-0.2,0-0.3-0.1L0.2,5.8C0,5.6,0,5.4,0.2,5.2C0.4,5,0.7,5,0.9,5.2l3,3l6.3-6.3c0.2-0.2,0.5-0.2,0.7,0C11,2,11,2.3,10.8,2.5L4.2,9.1C4.1,9.2,4,9.3,3.8,9.3z'/></svg>",
    "arrow": "<svg viewBox='0 0 11 11'><path d='M3.1,10.7c-0.1,0-0.2,0-0.3-0.1c-0.2-0.2-0.2-0.5,0-0.7l4.4-4.4L2.8,1.1c-0.2-0.2-0.2-0.5,0-0.7c0.2-0.2,0.5-0.2,0.7,0l4.8,4.8c0.2,0.2,0.2,0.5,0,0.7l-4.8,4.8C3.4,10.7,3.2,10.7,3.1,10.7z'/></svg>",
    "windows": {
      "minimize": "<svg viewBox='0 0 11 11'><path d='M11,4.9v1.1H0V4.399h11z'/></svg>",
      "maximize": "<svg viewBox='0 0 11 11'><path d='M0,1.7v7.6C0,10.2,0.8,11,1.7,11h7.6c0.9,0,1.7-0.8,1.7-1.7V1.7C11,0.8,10.2,0,9.3,0H1.7C0.8,0,0,0.8,0,1.7z M8.8,9.9H2.2c-0.6,0-1.1-0.5-1.1-1.1V2.2c0-0.6,0.5-1.1,1.1-1.1h6.7c0.6,0,1.1,0.5,1.1,1.1v6.7C9.9,9.4,9.4,9.9,8.8,9.9z'/></svg>",
      "restore": "<svg viewBox='0 0 11 11'><path d='M7.9,2.2h-7C0.4,2.2,0,2.6,0,3.1v7C0,10.6,0.4,11,0.9,11h7c0.5,0,0.9-0.4,0.9-0.9v-7C8.8,2.6,8.4,2.2,7.9,2.2z M7.7,9.6 c0,0.2-0.1,0.3-0.3,0.3h-6c-0.2,0-0.3-0.1-0.3-0.3v-6c0-0.2,0.1-0.3,0.3-0.3h6c0.2,0,0.3,0.1,0.3,0.3V9.6z'/><path d='M10,0H3.5v1.1h6.1c0.2,0,0.3,0.1,0.3,0.3v6.1H11V1C11,0.4,10.6,0,10,0z'/></svg>",
      "close": "<svg viewBox='0 0 11 11'><path d='M6.279 5.5L11 10.221l-.779.779L5.5 6.279.779 11 0 10.221 4.721 5.5 0 .779.779 0 5.5 4.721 10.221 0 11 .779 6.279 5.5z'/></svg>"
    }
  }`

	protected platformIcons: { [key: string]: string }

	constructor(private _item: MenuItem, private parentOptions: MenuBarOptions, private options: IMenuOptions, private menuItems?: IMenuItem[], private closeSubMenu = () => { }) {
		super()

		const jWindowIcons = JSON.parse(this.windowIcons)
		this.platformIcons = jWindowIcons

		// Set mnemonic
		if (this._item.label && options.enableMnemonics) {
			let label = this._item.label
			if (label) {
				let matches = MENU_MNEMONIC_REGEX.exec(label)
				if (matches) {
					this._mnemonic = KeyCodeUtils.fromString((!!matches[1] ? matches[1] : matches[2]).toLocaleUpperCase())
				}
			}
		}
	}

	render(el: HTMLElement): void {
		this._currentElement = el

		this._register(addDisposableListener(this.element!, EventType.MOUSE_DOWN, e => {
			if (this.item.enabled && e.button === 0 && this.element) {
				addClass(this.element, 'active')
			}
		}))

		this._register(addDisposableListener(this.element!, EventType.CLICK, e => {
			if (this.item.enabled) {
				this.onClick(e)
			}
		}))

		this._register(addDisposableListener(this.element!, EventType.DBLCLICK, e => {
			EventHelper.stop(e, true)
		}))


			;[EventType.MOUSE_UP, EventType.MOUSE_OUT].forEach(event => {
				this._register(addDisposableListener(this.element!, event, e => {
					EventHelper.stop(e)
					removeClass(this.element!, 'active')
				}))
			})

		this.itemElement = append(this.element!, $('a.cet-action-menu-item'))

		if (this.mnemonic) {
			this.itemElement.setAttribute('aria-keyshortcuts', `${this.mnemonic}`)
		}

		this.iconElement = append(this.itemElement, $('span.cet-menu-item-icon'))
		this.iconElement.setAttribute('role', 'none')

		this.labelElement = append(this.itemElement, $('span.cet-action-label'))

		this.updateLabel()
		this.setAccelerator()
		this.updateIcon()
		this.updateTooltip()
		this.updateEnabled()
		this.updateChecked()
		this.updateVisibility()
	}

	onClick(event: EventLike) {
		EventHelper.stop(event, true)
		ipcRenderer.send('menu-event', this.item.commandId)

		if (this.item.type === 'checkbox') {
			this.item.checked = !this.item.checked
			this.updateChecked()
		} else if (this.item.type === 'radio') {
			this.updateRadioGroup()
		}

		this.closeSubMenu()
	}

	protected applyStyle(): void {
		if (!this.menuStyle) {
			return
		}

		const isSelected = this.element && hasClass(this.element, 'focused')
		const fgColor = isSelected && this.menuStyle.selectionForegroundColor ? this.menuStyle.selectionForegroundColor : this.menuStyle.foregroundColor
		const bgColor = isSelected && this.menuStyle.selectionBackgroundColor ? this.menuStyle.selectionBackgroundColor : null

		if (this.itemElement) {
			this.itemElement.style.color = fgColor ? fgColor.toString() : ''
			this.itemElement.style.backgroundColor = bgColor ? bgColor.toString() : ''

			if (this.iconElement) applyFill(this.iconElement.firstElementChild, this.parentOptions?.svgColor, fgColor)
		}
	}

	updateStyle(style: IMenuStyle): void {
		this.menuStyle = style
		this.applyStyle()
	}

	focus(): void {
		if (this.element) {
			this.element.focus()
			addClass(this.element, 'focused')
		}

		this.applyStyle()
	}

	blur(): void {
		if (this.element) {
			this.element.blur()
			removeClass(this.element, 'focused')
		}

		this.applyStyle()
	}

	setAccelerator(): void {
		let accelerator = null

		if (this.item.role) {
			switch (this.item.role.toLocaleLowerCase()) {
				case 'undo':
					accelerator = 'CtrlOrCmd+Z'
					break
				case 'redo':
					accelerator = 'CtrlOrCmd+Y'
					break
				case 'cut':
					accelerator = 'CtrlOrCmd+X'
					break
				case 'copy':
					accelerator = 'CtrlOrCmd+C'
					break
				case 'paste':
					accelerator = 'CtrlOrCmd+V'
					break
				case 'selectall':
					accelerator = 'CtrlOrCmd+A'
					break
				case 'minimize':
					accelerator = 'CtrlOrCmd+M'
					break
				case 'close':
					accelerator = 'CtrlOrCmd+W'
					break
				case 'reload':
					accelerator = 'CtrlOrCmd+R'
					break
				case 'forcereload':
					accelerator = 'CtrlOrCmd+Shift+R'
					break
				case 'toggledevtools':
					accelerator = 'CtrlOrCmd+Shift+I'
					break
				case 'togglefullscreen':
					accelerator = 'F11'
					break
				case 'resetzoom':
					accelerator = 'CtrlOrCmd+0'
					break
				case 'zoomin':
					accelerator = 'CtrlOrCmd++'
					break
				case 'zoomout':
					accelerator = 'CtrlOrCmd+-'
					break
			}
		}

		if (this.item.label && this.item.accelerator) {
			accelerator = this.item.accelerator
		}

		if (this.itemElement && accelerator !== null) {
			append(this.itemElement, $('span.keybinding')).textContent = parseAccelerator(accelerator)
		}
	}

	updateLabel(): void {
		let label = this.item.label || ''
		const cleanMenuLabel = cleanMnemonic(label);

		// Update the button label to reflect mnemonics

		if (this.options.enableMnemonics) {
			const cleanLabel = strings.escape(label);

			// This is global so reset it
			MENU_ESCAPED_MNEMONIC_REGEX.lastIndex = 0;
			let escMatch = MENU_ESCAPED_MNEMONIC_REGEX.exec(cleanLabel);

			// We can't use negative lookbehind so we match our negative and skip
			while (escMatch && escMatch[1]) {
				escMatch = MENU_ESCAPED_MNEMONIC_REGEX.exec(cleanLabel);
			}

			const replaceDoubleEscapes = (str: string) => str.replace(/&amp;&amp;/g, '&amp;');

			if (escMatch) {
				this.labelElement!.innerText = '';
				this.labelElement!.append(
					strings.ltrim(replaceDoubleEscapes(cleanLabel.substring(0, escMatch.index)), ' '),
					$('mnemonic', { 'aria-hidden': 'true' }, escMatch[3]),
					strings.rtrim(replaceDoubleEscapes(cleanLabel.substring(escMatch.index + escMatch[0].length)), ' ')
				);
			} else {
				this.labelElement!.innerText = replaceDoubleEscapes(cleanLabel).trim();
			}
		} else {
			this.labelElement!.innerText = cleanMenuLabel.replace(/&&/g, '&');
		}

		const mnemonicMatches = MENU_MNEMONIC_REGEX.exec(label);

		// Register mnemonics
		/* if (mnemonicMatches) {
			const mnemonic = !!mnemonicMatches[1] ? mnemonicMatches[1] : mnemonicMatches[3];

			if (this.options.enableMnemonics) {
				buttonElement.setAttribute('aria-keyshortcuts', 'Alt+' + mnemonic.toLocaleLowerCase());
			} else {
				buttonElement.removeAttribute('aria-keyshortcuts');
			}
		} */
	}

	updateIcon(): void {
		if (this.item.icon) {
			const icon = this.item.icon

			if (this.iconElement && icon) {
				const iconE = append(this.iconElement, $('img'))
				iconE.setAttribute('src', icon.toString())
			}
		} else if (this.iconElement && this.item.type === 'checkbox') {
			addClass(this.iconElement, 'checkbox')
			this.iconElement.innerHTML = this.platformIcons.check
		} else if (this.item.type === 'radio') {
			addClass(this.iconElement!, 'radio')
			this.iconElement!.innerHTML = this.item.checked ? this.platformIcons.check : ''
		}

		applyFill(this.iconElement?.firstElementChild, this.parentOptions?.svgColor, this.menuStyle?.foregroundColor)
	}

	updateTooltip(): void {
		let title: string | null = null

		if (this.item.sublabel) {
			title = this.item.sublabel
		} else if (!this.item.label && this.item.label && this.item.icon) {
			title = this.item.label

			if (this.item.accelerator) {
				title = parseAccelerator(this.item.accelerator)
			}
		}

		if (this.itemElement && title) {
			this.itemElement.title = title
		}
	}

	updateEnabled(): void {
		if (this.element) {
			if (this.item.enabled && this.item.type !== 'separator') {
				removeClass(this.element, 'disabled')
				this.element.tabIndex = 0
			} else {
				addClass(this.element, 'disabled')
			}
		}
	}

	updateVisibility(): void {
		if (this.item.visible === false && this.itemElement) {
			this.itemElement.remove()
		}
	}

	updateChecked(): void {
		if (this.itemElement) {
			if (this.item.checked) {
				addClass(this.itemElement, 'checked')
				this.itemElement.setAttribute('aria-checked', 'true')
			} else {
				removeClass(this.itemElement, 'checked')
				this.itemElement.setAttribute('aria-checked', 'false')
			}
		}
	}

	updateRadioGroup(): void {
		if (this.radioGroup === undefined) {
			this.radioGroup = this.getRadioGroup()
		}

		if (this.menuItems) {
			for (let i = this.radioGroup.start; i < this.radioGroup.end; i++) {
				const menuItem = this.menuItems[i]
				if (menuItem instanceof CETMenuItem && menuItem.item.type === 'radio') {
					// update item.checked for each radio button in group
					menuItem.item.checked = menuItem === this
					menuItem.updateIcon()
					// updateChecked() *all* radio buttons in group
					menuItem.updateChecked()
					// set the radioGroup property of all the other radio buttons since it was already calculated
					if (menuItem !== this) {
						menuItem.radioGroup = this.radioGroup
					}
				}
			}
		}
	}

	/** radioGroup index's starts with (previous separator +1 OR menuItems[0]) and ends with (next separator OR menuItems[length]) */
	getRadioGroup(): { start: number, end: number } {
		let startIndex = 0
		let endIndex = this.menuItems ? this.menuItems.length : 0
		let found = false

		if (this.menuItems) {
			for (const index in this.menuItems) {
				const menuItem = this.menuItems[index]
				if (menuItem === this) {
					found = true
				} else if (menuItem instanceof CETMenuItem && menuItem.isSeparator()) {
					if (found) {
						endIndex = Number.parseInt(index)
						break
					} else {
						startIndex = Number.parseInt(index) + 1
					}
				}
			}
		}

		return { start: startIndex, end: endIndex }
	}

	get element() {
		return this._currentElement
	}

	get item(): MenuItem {
		return this._item
	}

	isEnabled(): boolean {
		return this.item.enabled
	}

	isSeparator(): boolean {
		return this.item.type === 'separator'
	}

	get mnemonic(): KeyCode | undefined {
		return this._mnemonic
	}

	dispose(): void {
		if (this.itemElement) {
			removeNode(this.itemElement)
			this.itemElement = undefined
		}

		super.dispose()
	}
}